var MovesApi = require('moves-api').MovesApi;
var Q = require('q');
var moment = require('moment-timezone');
var polyUtil = require('polyline-encoded');
var dailiesMap = require('dailies-map');
var fs = require('fs');
var config = require('../config');

var moves = new MovesApi({ accessToken: process.env.MOVES_TOKEN });

function removeOffPeriods(segments) {
	return segments.reduce(function(arrSeg, currentSeg){ 
		var cloneSeg = JSON.parse(JSON.stringify(currentSeg));
		if (cloneSeg.type === 'off') {
			if (cloneSeg.activities) {
				cloneSeg.type = 'move';
				return arrSeg.concat(cloneSeg);
			} else {
				return arrSeg;
			}
		} else {
			return arrSeg.concat(cloneSeg)
		}
	}, []);
}

function mergeDuplicateMoves(segments) {
	return segments.reduce(function(arrSeg, currentSeg){ 
		var cloneSeg = JSON.parse(JSON.stringify(currentSeg));
		var lastSeg = arrSeg[arrSeg.length-1];
		if (lastSeg && (
			(lastSeg.type === 'move' && cloneSeg.type === 'move') ||
			(lastSeg.type === 'place' && cloneSeg.type === 'place' && lastSeg.place.id === cloneSeg.place.id)
		)) {
			var activities = (lastSeg.activities || []).concat(cloneSeg.activities || []);
			lastSeg.activities = activities.reduce(function(arrAct, currentAct){
				var lastAct = arrAct[arrAct.length-1];
				if (lastAct && lastAct.activity === currentAct.activity) {
					if (lastAct.calories) {
						lastAct.calories += currentAct.calories;
					}
					if (lastAct.steps) {
						lastAct.steps += currentAct.steps;
					}
					lastAct.distance += currentAct.distance;
					lastAct.duration += currentAct.duration;
					lastAct.endTime = currentAct.endTime;
					lastAct.trackPoints = (lastAct.trackPoints || []).concat(currentAct.trackPoints || []);
					return arrAct;
				} else {
					return arrAct.concat(currentAct);
				}
			}, []);
			lastSeg.endTime = cloneSeg.endTime;
			return arrSeg;
		} else {
			cloneSeg.activities = (cloneSeg.activities || []).reduce(function(arrAct, currentAct){
				var lastAct = arrAct[arrAct.length-1];
				if (lastAct && lastAct.activity === currentAct.activity) {
					if (lastAct.calories) {
						lastAct.calories += currentAct.calories;
					}
					if (lastAct.steps) {
						lastAct.steps += currentAct.steps;
					}
					lastAct.distance += currentAct.distance;
					lastAct.duration += currentAct.duration;
					lastAct.endTime = currentAct.endTime;
					lastAct.trackPoints = (lastAct.trackPoints || []).concat(currentAct.trackPoints || []);
					return arrAct;
				} else {
					return arrAct.concat(currentAct);
				}
			}, []);
			return arrSeg.concat(cloneSeg);
		}
	}, []);
}

exports.getStoryline = function() {
	console.log('getStoryline');

	var deferred = Q.defer();
	moves.getStoryline({ 
		trackPoints: true, 
		date: moment().tz(config.TIMEZONE).subtract(config.DAYS_AGO, 'day') 
	}, function(error, storylines) {
		if (error) {
			return deferred.reject(error);
		}

		var storyline = {
			summary: storylines[0].summary,
			mapURL: '',
			segments: []
		};

		var cleanSegments = mergeDuplicateMoves(removeOffPeriods(storylines[0].segments));
		cleanSegments.forEach(function(segment, i){
			if (segment.place) {
				var temp = {
					start: moment(segment.startTime, 'YYYYMMDDTHms').format('HH:mm'),
					end: moment(segment.endTime, 'YYYYMMDDTHms').format('HH:mm')
				};
				if (segment.activities) {
					temp.activity = segment.activities[0].activity;
					if (segment.activities.length === 1) {
						temp.duration = segment.activities[0].duration;
						temp.distance = segment.activities[0].distance;
						temp.steps = segment.activities[0].steps;
						temp.calories = segment.activities[0].calories;
					} else if (segment.activities.length > 1) {
						temp.duration = segment.activities.reduce(function(a, b){ return (a.duration || 0) + (b.duration || 0); });
						temp.distance = segment.activities.reduce(function(a, b){ return (a.distance || 0) + (b.distance || 0); });
						temp.steps = segment.activities.reduce(function(a, b){ return (a.steps || 0) + (b.steps || 0); });
						temp.calories = segment.activities.reduce(function(a, b){ return (a.calories || 0) + (b.calories || 0); });
					}
				}
				if (i === 0) temp.start = '00:00';
				if (i === cleanSegments.length - 1) temp.end = '00:00';
				temp.place = {
					name: segment.place.name,
					lon: segment.place.location.lon,
					lat: segment.place.location.lat,
					foursquareId: segment.place.foursquareId,
					type: segment.place.type
				};
				storyline.segments.push(temp);
			} else {
				var path = '', start, finish;
				segment.activities.forEach(function(activity){
					var temp = {
						start: moment(activity.startTime, 'YYYYMMDDTHms').format('HH:mm'),
						end: moment(activity.endTime, 'YYYYMMDDTHms').format('HH:mm'),
						activity: activity.activity,
						duration: activity.duration,
						distance: activity.distance,
						calories: activity.calories,
						steps: activity.steps
					};
					if (activity.trackPoints) {
						start = {
							lat: activity.trackPoints[0].lat,
							lon: activity.trackPoints[0].lon
						}
						finish = {
							lat: activity.trackPoints[activity.trackPoints.length-1].lat,
							lon: activity.trackPoints[activity.trackPoints.length-1].lon
						}
						var path = encodeURIComponent(polyUtil.encode(activity.trackPoints.map(function(point){
							return [point.lat, point.lon];
						})));
					}
					temp.route = {
						path: 'enc:' + path,
						start: start,
						finish: finish
					};
					storyline.segments.push(temp);
				});
			}
		});

		dailiesMap.convertToMap(storylines).then(function(map){
			storyline.mapURL = map;
			deferred.resolve(storyline);
		});
	});
	return deferred.promise;
}

exports.getWeeklyStoryline = function() {
	console.log('getWeeklyStoryline');

	console.log('from', moment().tz(config.TIMEZONE).subtract(Number(config.DAYS_AGO) + 6, 'day').toString());
	console.log('to', moment().tz(config.TIMEZONE).subtract(config.DAYS_AGO, 'day').toString());

	var deferred = Q.defer();
	moves.getStoryline({ 
		trackPoints: true, 
		from: moment().tz(config.TIMEZONE).subtract(Number(config.DAYS_AGO) + 6, 'day'),
		to: moment().tz(config.TIMEZONE).subtract(config.DAYS_AGO, 'day')
	}, function(error, storylines) {
		if (error) {
			return deferred.reject(error);
		}
		dailiesMap.convertToWeeklyMap(storylines).then(function(map){
			deferred.resolve({ mapURL: map });
		}).catch(deferred.reject);
	});
	return deferred.promise;
}