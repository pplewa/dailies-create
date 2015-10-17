var request = require('request');
var moment = require('moment-timezone');
var Q = require('q');
var config = require('../config');

exports.getMappiness = function() {
	console.log('getMappiness');

	var deferred = Q.defer();
	request({ 
		url: process.env.MAPPINESS_URL, 
		json: true 
	}, function (error, response, data) {
		if (error) {
			return deferred.reject(error);
		}
		var a = h = r = logs = 0;
		var now = moment().tz(config.TIMEZONE).startOf('day');
		for (var i = 0; i < 1000; i++) {
			var logDate = moment(new Date(data[i].start_time_epoch * 1000)).tz(config.TIMEZONE).startOf('day');
			var diff = now.diff(logDate, 'days');
			if (diff === Number(config.DAYS_AGO)) {
				logs++;
				a += data[i].awake;
				h += data[i].happy;
				r += data[i].relaxed;
			}
		}
		function getVal(val) {
			return +(val/logs).toFixed(3);
		}
		function getFace(face) {
			var faces = ['😫', '😟', '😐', '😌', '😀'];
			return faces[Math.round((face/logs)*5)-1];
		}

		deferred.resolve([
			{ name: 'Logs', 'value': logs },
			{ name: 'Happy', 'value': getVal(h) + ' ' + getFace(h) },
			{ name: 'Relax', 'value': getVal(r) + ' ' + getFace(r) },
			{ name: 'Awake', 'value': getVal(a) + ' ' + getFace(a) },
			{ name: 'Productivity', 'value': '0 😫😟😐😌😀' }
		]);
	});
	return deferred.promise;
}
