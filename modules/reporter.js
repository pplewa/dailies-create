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
				return deferred.reject(error2);
			}

			var responses = JSONSelect.match('.snapshots .responses', data2).length;
			var sleep = JSONSelect.match('.snapshots .responses .questionPrompt:val("How did you sleep?") ~ .answeredOptions string', data2)[0];
			var happy = JSONSelect.match('.snapshots .responses .questionPrompt:val("How happy are you? 1-10") ~ .numericResponse', data2);
			var relaxed = JSONSelect.match('.snapshots .responses .questionPrompt:val("How relaxed are you? 1-10") ~ .numericResponse', data2);
			var farts = JSONSelect.match('.snapshots .responses .questionPrompt:val("How many farts?") ~ .numericResponse', data2)[0];
			var eatSlow = JSONSelect.match('.snapshots .responses .questionPrompt:val("Did I eat slow today?") ~ .answeredOptions string', data2)[0];
			var pomodoros = JSONSelect.match('.snapshots .responses .questionPrompt:val("How many pomodoros did you do today?") ~ .numericResponse', data2)[0];

			var h = happy.map(Number).reduce(function(a,b){ return a + b }, 0);
			var r = relaxed.map(Number).reduce(function(a,b){ return a + b }, 0);

			deferred.resolve([
				{ name: 'Logs', 'value': responses },
				{ name: 'Sleep', 'value': sleep || '' },
				{ name: 'Happy', 'value': getVal(h, happy.length) + ' ' + getFace(getVal(h, happy.length)) },
				{ name: 'Relax', 'value': getVal(r, happy.length) + ' ' + getFace(getVal(r, happy.length)) },
				{ name: 'Farts', 'value': farts || 15 },
				{ name: 'Eat Slow', 'value': eatSlow },
				{ name: 'Pomodoros', 'value': pomodoros || 0 }
			]);
		});

	});
	return deferred.promise;
}
