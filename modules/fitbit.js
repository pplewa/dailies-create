var FitbitClient = require('fitbit-client-oauth2');
var moment = require('moment-timezone');
var Q = require('q');
var config = require('../config');
var request = require('request');

var client = new FitbitClient(process.env.FITBIT_CLIENT_ID, process.env.FITBIT_CLIENT_SECRET);

function updateToken(data) {
	var deferred = Q.defer();
	request.put({ url: process.env.FITBIT_STORE_URL, json: data }, function(error) {
		if (error) {
			return deferred.reject(error);
		}
		deferred.resolve();
	});
	return deferred.promise;
}

function getToken() {
	var deferred = Q.defer();
	request({ url: process.env.FITBIT_STORE_URL, json: true }, function(error, response, data) {
		if (error) {
			return deferred.reject(error);
		}
		client.refreshAccessToken(data.token, { forceRefresh: true }).then(function(new_token) {
			updateToken({ token: new_token.token }).then(function(){
				deferred.resolve(new_token.token);
			}).catch(deferred.reject);
		}).catch(deferred.reject);

	});
	return deferred.promise;
}

exports.getFitbitData = function() {
	console.log('getFitbit');
	var deferred = Q.defer();

	getToken().then(function(token){

		var getFitbitData = client.getTimeSeries.bind(client, token);
		var day = moment().tz(config.TIMEZONE).subtract(config.DAYS_AGO, 'day').format('YYYY-MM-DD');
		var dayAfter = moment().tz(config.TIMEZONE).subtract(Number(config.DAYS_AGO) - 1, 'day').format('YYYY-MM-DD');

		Q.all([
			getFitbitData({ resourcePath: 'activities/heart', baseDate: day, period: '1d' }),
			getFitbitData({ resourcePath: 'sleep', baseDate: day, units: 'METRIC' }),
			getFitbitData({ resourcePath: 'sleep', baseDate: dayAfter, units: 'METRIC' }),
			getFitbitData({ resourcePath: 'body/log/weight', baseDate: day, units: 'METRIC' }),
			getFitbitData({ resourcePath: 'activities', baseDate: day })
		]).spread(function(heart, sleep, sleepAfter, weight, activities){
			var sleepObj = {};
			try {
				sleepObj = {
					goSleep: moment(sleepAfter.sleep[0].startTime).format('H:mm'),
					wakeUp: moment(sleep.sleep[0].startTime).add(sleep.sleep[0].timeInBed, 'minutes').format('H:mm'),
					duration: moment.utc(sleep.summary.totalMinutesAsleep * 60 * 1000).format('H:mm')
				}
			} catch(ignore) {}
			deferred.resolve({
				heart: heart['activities-heart'][0].value,
				sleep: sleepObj,
				weight: weight.weight[0] || {},
				activities: activities.summary
			});
		}).catch(deferred.reject);

	}).catch(deferred.reject);

	return deferred.promise;
}
