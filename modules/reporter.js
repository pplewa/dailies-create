var request = require('request');
var moment = require('moment-timezone');
var Q = require('q');
var JSONSelect = require('JSONSelect');
var config = require('../config');

function getVal(val, logs) {
	if (!logs) {
		return 0;
	}
	return +(val/logs/10).toFixed(3);
}
function getFace(val) {
	var faces = ['😫', '😟', '😐', '😌', '😀'];
	return faces[Math.round(val*5)-1];
}

exports.getReporter = function() {
	console.log('getReporter');

	var deferred = Q.defer();
	request({ 
		url: process.env.REPORTER_URL, 
	}, function (error, response, data) {
		if (error) {
			return deferred.reject(error);
		}

		var day = moment().tz(config.TIMEZONE).subtract(config.DAYS_AGO, 'day').format('YYYY-MM-DD');
		var reportUrl = data.match(/href="([^\'\"]+)/g).filter(function(link){
			return link.indexOf(day + '-reporter-export.json') !== -1
		})[0].replace('href="', '').replace('?dl=0', '?raw=1');

		request({ url: reportUrl, json: true }, function (error2, response2, data2) {
			if (error2) {
				// return deferred.reject(error2);
				deferred.resolve([]);
			}

			var responses = JSONSelect.match('.snapshots .responses', data2).length;
			var sleep = JSONSelect.match('.snapshots .responses .questionPrompt:val("How did you sleep?") ~ .answeredOptions string', data2)[0];
			var happy = JSONSelect.match('.snapshots .responses .questionPrompt:val("How happy are you? 1-10") ~ .numericResponse', data2);
			var relaxed = JSONSelect.match('.snapshots .responses .questionPrompt:val("How relaxed are you? 1-10") ~ .numericResponse', data2);
			var farts = JSONSelect.match('.snapshots .responses .questionPrompt:val("How many farts?") ~ .numericResponse', data2)[0];
			var drinks = JSONSelect.match('.snapshots .responses .questionPrompt:val("How many drinks?") ~ .numericResponse', data2)[0];
			var freak = JSONSelect.match('.snapshots .responses .questionPrompt:val("How many times did I freak out?") ~ .numericResponse', data2)[0];
			var sex = JSONSelect.match('.snapshots .responses .questionPrompt:val("Did I have sex today?") ~ .answeredOptions string', data2)[0];
			var eatSlow = JSONSelect.match('.snapshots .responses .questionPrompt:val("Did I eat slow today?") ~ .answeredOptions string', data2)[0];
			var pomodoros = JSONSelect.match('.snapshots .responses .questionPrompt:val("How many pomodoros did you do today?") ~ .numericResponse', data2)[0];

			var success = JSONSelect.match('.snapshots .responses .questionPrompt:val("Today\'s Success") ~ .textResponses', data2)[0];
			var failure = JSONSelect.match('.snapshots .responses .questionPrompt:val("Today\'s Failure") ~ .textResponses', data2)[0];
			var surprise = JSONSelect.match('.snapshots .responses .questionPrompt:val("Today\'s Surprise") ~ .textResponses', data2)[0];
			var highlights = JSONSelect.match('.snapshots .responses .questionPrompt:val("Today\'s Highlights") ~ .tokens', data2)[0];

			var h = happy.map(Number).reduce(function(a,b){ return a + b }, 0);
			var r = relaxed.map(Number).reduce(function(a,b){ return a + b }, 0);

			var reporterData = [
				{ name: 'Logs', 'value': responses },
				{ name: 'Sleep', 'value': sleep || '' },
				{ name: 'Sex', 'value': sex || 'No' },
				{ name: 'Eat Slow', 'value': eatSlow || 'No' },
				{ name: 'Farts', 'value': farts || 15 },
				{ name: 'Drinks', 'value': drinks || 1 },
				{ name: 'Freak Outs', 'value': freak || 0 },
				{ name: 'Pomodoros', 'value': pomodoros || 0 }
			];

			if (success && success[0] && success[0].text) {
				reporterData.push({ name: 'Success', 'value': success[0].text });
			}

			if (failure && failure[0] && failure[0].text) {
				reporterData.push({ name: 'Failure', 'value': failure[0].text });
			}

			if (surprise && surprise[0] && surprise[0].text) {
				reporterData.push({ name: 'Surprise', 'value': surprise[0].text });
			}

			if (highlights && highlights.length) {
				reporterData.push({ 
					name: 'Highlights', 
					value: highlights.reduce(function(str, curr){ 
						return str + curr.text + ', ' 
					}, '') 
				});
			}

			reporterData.push(
				{ name: 'Happy', 'value': getVal(h, happy.length) + ' ' + getFace(getVal(h, happy.length)) },
				{ name: 'Relax', 'value': getVal(r, happy.length) + ' ' + getFace(getVal(r, happy.length)) }
			);

			deferred.resolve(reporterData);
		});

	});
	return deferred.promise;
}
