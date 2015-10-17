var MovesApi = require('moves-api').MovesApi;
var Q = require('q');
var moment = require('moment-timezone');
var polyUtil = require('polyline-encoded');
var config = require('../config');

var moves = new MovesApi({ accessToken: process.env.MOVES_TOKEN });

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
			mapPath: '',
			segments: []
		};

		var paths = [];
		var activities = [];
		var previousActivity = '';
		storylines[0].segments.forEach(function(segment) {
			// Add movements if we got an activities segment
			if(segment.type == 'move' && Array.isArray(segment.activities)) {
				segment.activities.forEach(function(activity) {
					if (activity.activity === previousActivity) {
						activity.trackPoints.forEach(function(point, i) {
							paths[paths.length-1].push([point.lat, point.lon]);
						});
					} else {
						previousActivity = activity.activity === 'walking' ? 'walking' : 'move';
						var _temp = [];
						activity.trackPoints.forEach(function(point, i) {
							_temp.push([point.lat, point.lon]);
						});
						paths[paths.length] = _temp;
						activities[paths.length] = previousActivity;
					}
				});
			}
		});

		var urlPath = ''
		paths.forEach(function(path, i){
			var style = activities[i] === 'walking' ? 'color:black|' : 'color:green|';
			urlPath += '&path='+style+'enc:' + encodeURIComponent(polyUtil.encode(path));
		});
		storyline.mapPath = urlPath;

		storylines[0].segments.forEach(function(segment, i){
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
				if (i === storylines[0].segments.length - 1) temp.end = '00:00';
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
					// if (i >= 10)
					storyline.segments.push(temp);
				});
			}

			deferred.resolve(storyline);
		});
	});
	return deferred.promise;
}
