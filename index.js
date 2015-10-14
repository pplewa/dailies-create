var Evernote = require('evernote').Evernote;
var MovesApi = require('moves-api').MovesApi;
var Fitbit = require('fitbit-node');
var Handlebars = require('handlebars');
var moment = require('moment');
var fs = require('fs');
var Q = require('q');
var html2enml = require('html2enml2').convert;
var polyUtil = require('polyline-encoded');
var request = require('request');

var DAYS_AGO = 1;

// Handlebars
Handlebars.registerHelper('mins', function(value) {
	return Math.round(value/60);
});
Handlebars.registerHelper('config', function(val1, val2) {
	return config[val1][val2];
});
Handlebars.registerHelper('upperCase', function(value) {
	return value.toLowerCase().replace(/\b[a-z]/g, function(letter) {
		return letter.toUpperCase();
	}).replace('_', ' ');
});
var template = fs.readFileSync('template.hbs', { encoding: 'utf-8' });
var getTemplate = Handlebars.compile(template);

// APIs
var evernote = new Evernote.Client({ token: process.env.EVERNOTE_TOKEN, sandbox: false });
var moves = new MovesApi({ accessToken: process.env.MOVES_TOKEN });
var fitbit = new Fitbit(process.env.FITBIT_KEY, process.env.FITBIT_SECRET);

var noteStore = evernote.getNoteStore();


function getFitbitData(url) {
	return fitbit.requestResource(url, 'GET', process.env.FITBIT_ACCESS_TOKEN, process.env.FITBIT_ACCESS_SECRET);
}

function makeNote(noteTitle, noteBody, parentNotebook) {
	var deferred = Q.defer();

	html2enml('<body>' + noteBody + '</body>', '', function(enml, res){
		var date = new Date();
		var yesterday = moment([date.getFullYear(), date.getMonth(), date.getDate()]).subtract(DAYS_AGO, 'day');
		var ourNote = new Evernote.Note({
			title: noteTitle,
			tagNames: ['Journal', yesterday.format('YYYY'), yesterday.format('MMMM'), yesterday.format('dddd')],
			content: enml,
			created: yesterday.valueOf(),
			resources: res
		});

		// parentNotebook is optional; if omitted, default notebook is used
		if (parentNotebook && parentNotebook.guid) {
			ourNote.notebookGuid = parentNotebook.guid;
		}

		// Attempt to create note in Evernote account
		noteStore.createNote(ourNote, function(error, note) {
			if (error) {
				console.log(arguments);
				deferred.reject(new Error(error));
				// Something was wrong with the note data
				// See EDAMErrorCode enumeration for error code explanation
				// http://dev.evernote.com/documentation/reference/Errors.html#Enum_EDAMErrorCode
			} else {
				deferred.resolve(note);
			}
		});
	});
	return deferred.promise;
}

function getMemories() {
	var deferred = Q.defer();
	var filter = new Evernote.NoteFilter({
		words: 'notebook:journal intitle:' + moment().subtract(DAYS_AGO, 'day').format('DD/MM/'),
		order: Evernote.NoteSortOrder.CREATED,
		ascending: false
	});
	var foodFilter = new Evernote.NoteFilter({
		words: 'notebook:food created:day-1',
		order: Evernote.NoteSortOrder.CREATED,
		ascending: false
	});
	var noteSpec = new Evernote.NotesMetadataResultSpec({
		includeTitle: true
	})
	noteStore.findNotesMetadata(filter, 0, 10, noteSpec, function(error, data){
		if (error) {
			deferred.reject(new Error(error));
		} else {
			var memories = [];
			data.notes.forEach(function(note){
				memories.push({
					link: 'evernote:///view/' + process.env.EVERNOTE_USER_ID + '/' + process.env.EVERNOTE_SHARD_ID + '/' + note.guid + '/' + note.guid + '/',
					title: note.title
				});
			});
			noteStore.findNotesMetadata(foodFilter, 0, 10, noteSpec, function(error, data){
				data.notes.forEach(function(note){
					memories.push({
						link: 'evernote:///view/' + process.env.EVERNOTE_USER_ID + '/' + process.env.EVERNOTE_SHARD_ID + '/' + note.guid + '/' + note.guid + '/',
						title: note.title
					});
				});
				deferred.resolve(memories);
			});
		}
	});
	return deferred.promise;
}

function getMappiness() {
	var deferred = Q.defer();
	request({ url: config.mappiness.url, json: true }, function (error, response, data) {
		if (error) {
			deferred.reject(new Error(error));
		} else {
			var a=0, h=0, r=0, logs = 0, date = new Date();
			var now = moment([date.getFullYear(), date.getMonth(), date.getDate()]);
			for (var i = 0; i < 10; i++) {
				var logDate = new Date(data[i].start_time_epoch*1000);
				var diff = now.diff(moment([logDate.getFullYear(), logDate.getMonth(), logDate.getDate()]), 'days');
				if (diff === DAYS_AGO) {
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
		};
	});
	return deferred.promise;
}


function getStoryline() {
	var deferred = Q.defer();
	moves.getStoryline({ trackPoints: true, date: moment().subtract(DAYS_AGO, 'day') }, function(error, storylines) {
		if (error) {
			deferred.reject(new Error(error));
		} else {
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
		}
	});
	return deferred.promise;
}

function getFitbit() {
	var deferred = Q.defer();
	var yesterday = moment().subtract(DAYS_AGO, 'day').format('YYYY-MM-DD');
	var weight = '/body/log/weight/date/' + yesterday + '.json';
	var fat = '/body/log/fat/date/' + yesterday + '.json';
	var sleep = '/sleep/date/' + yesterday + '.json';
	var activities = '/activities/date/' + yesterday + '.json';

	Q.all([getFitbitData(weight), getFitbitData(fat), getFitbitData(sleep), getFitbitData(activities)]).spread(function(weight, fat, sleep, activities){
		var weightData = JSON.parse(weight[0]).weight[0];
		var fatData = JSON.parse(fat[0]).fat[0];
		var sleepData = JSON.parse(sleep[0]).summary;
		var activitiesData = JSON.parse(activities[0]).summary;

		deferred.resolve({
			weight: weightData.weight,
			fat: fatData.fat,
			sleep: moment.utc(sleepData.totalMinutesAsleep * 60 * 1000).format("H:mm"),
			steps: activitiesData.steps
		});
	}).fail(deferred.reject);

	return deferred.promise;
}

Q.all([getMemories(), getMappiness(), getStoryline(), getFitbit()]).spread(function(memories, mappiness, storyline, fitbit){
	var noteTitle = moment().subtract(DAYS_AGO, 'day').format('DD/MM/YYYY ddd');
	var noteBody = getTemplate({
		memories: memories,
		mappiness: mappiness,
		storyline: storyline,
		fitbit: fitbit
	});

	makeNote(noteTitle, noteBody).then(function(note){
		console.log('ok');
	});
}).fail(function(){
	console.log(arguments);
});