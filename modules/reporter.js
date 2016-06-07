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

function getSleepData(url) {
	console.log('getReporterSleep');
	var deferred = Q.defer();


	request({ url: url, json: true }, function (error, response, data) {
		if (error) {
			return deferred.resolve([]);
		}
		var sleep = JSONSelect.match('.responses .questionPrompt:val("How did you sleep?") ~ .answeredOptions string', data)[0];
		var goal = JSONSelect.match('.responses .questionPrompt:val("What is your goal for today?") ~ .textResponses', data)[0];
		var dreams = JSONSelect.match('.responses .questionPrompt:val("Did you remember any dreams?") ~ .textResponses', data)[0];
		deferred.resolve({
			sleep: sleep,
			goal: goal,
			dreams: dreams
		})
	});

	return deferred.promise;
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
		var dayBefore = moment().tz(config.TIMEZONE).subtract(config.DAYS_AGO + 1, 'day').format('YYYY-MM-DD');
		var reportUrl = data.match(/href="([^\'\"]+)/g).filter(function(link){
			return link.indexOf(day + '-reporter-export.json') !== -1
		})[0].replace('href="', '').replace('?dl=0', '?raw=1');
		var reportDayBeforeUrl = data.match(/href="([^\'\"]+)/g).filter(function(link){
			return link.indexOf(dayBefore + '-reporter-export.json') !== -1
		})[0].replace('href="', '').replace('?dl=0', '?raw=1');

		getSleepData(reportDayBeforeUrl).then(function(sleepData) {

			request({ url: reportUrl, json: true }, function (error2, response2, data2) {
				if (error2) {
					// return deferred.reject(error2);
					return deferred.resolve([]);
				}

				var responses = JSONSelect.match('.responses', data2).length;
				var happy = JSONSelect.match('.responses .questionPrompt:val("How happy are you? 1-10") ~ .numericResponse', data2);
				var relaxed = JSONSelect.match('.responses .questionPrompt:val("How relaxed are you? 1-10") ~ .numericResponse', data2);
				var farts = JSONSelect.match('.responses .questionPrompt:val("How many farts?") ~ .numericResponse', data2)[0];
				var drinks = JSONSelect.match('.responses .questionPrompt:val("How many drinks?") ~ .numericResponse', data2)[0];
				var freak = JSONSelect.match('.responses .questionPrompt:val("How many times did I freak out?") ~ .numericResponse', data2)[0];
				var sex = JSONSelect.match('.responses .questionPrompt:val("Did I have sex today?") ~ .answeredOptions string', data2)[0];
				var eatSlow = JSONSelect.match('.responses .questionPrompt:val("Did I eat slow today?") ~ .answeredOptions string', data2)[0];
				var pomodoros = JSONSelect.match('.responses .questionPrompt:val("How many pomodoros did you do today?") ~ .numericResponse', data2)[0];

				// evening
				var success = JSONSelect.match('.responses .questionPrompt:val("Today\'s Successes") ~ .textResponses', data2)[0];
				var failure = JSONSelect.match('.responses .questionPrompt:val("Today\'s Failures") ~ .textResponses', data2)[0];
				var surprise = JSONSelect.match('.responses .questionPrompt:val("Today\'s Surprises") ~ .textResponses', data2)[0];
				var lessons = JSONSelect.match('.responses .questionPrompt:val("Today\'s Lessons") ~ .textResponses', data2)[0];
				var highlights = JSONSelect.match('.responses .questionPrompt:val("Today\'s Highlights") ~ .tokens', data2)[0];

				var h = happy.map(Number).reduce(function(a,b){ return a + b }, 0);
				var r = relaxed.map(Number).reduce(function(a,b){ return a + b }, 0);

				var reporterData = [
					{ name: 'Logs', 'value': responses },
					{ name: 'Sleep', 'value': sleepData.sleep || '' },
					{ name: 'Sex', 'value': sex || 'No' },
					{ name: 'Eat Slow', 'value': eatSlow || 'No' },
					{ name: 'Farts', 'value': farts || 15 },
					{ name: 'Drinks', 'value': drinks || 1 },
					{ name: 'Freak Outs', 'value': freak || 0 },
					{ name: 'Pomodoros', 'value': pomodoros || 0 }
				];

				if (sleepData.goal && sleepData.goal[0] && sleepData.goal[0].text) {
					reporterData.push({ name: 'Goal', 'value': sleepData.goal[0].text });
				}

				if (sleepData.dreams && sleepData.dreams[0] && sleepData.dreams[0].text) {
					reporterData.push({ name: 'Dreams', 'value': sleepData.dreams[0].text });
				}

				if (success && success[0] && success[0].text) {
					reporterData.push({ name: 'Success', 'value': success[0].text });
				}

				if (failure && failure[0] && failure[0].text) {
					reporterData.push({ name: 'Failure', 'value': failure[0].text });
				}

				if (surprise && surprise[0] && surprise[0].text) {
					reporterData.push({ name: 'Surprise', 'value': surprise[0].text });
				}

				if (lessons && lessons[0] && lessons[0].text) {
					reporterData.push({ name: 'Lessons', 'value': lessons[0].text });
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
	});

	return deferred.promise;
}
