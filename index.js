var Evernote = require('evernote').Evernote;
var MovesApi = require('moves-api').MovesApi;
var Fitbit = require('fitbit-node');
var Handlebars = require('handlebars');
var moment = require('moment-timezone');
var fs = require('fs');
var Q = require('q');
var html2enml = require('html2enml2').convert;
var polyUtil = require('polyline-encoded');
var request = require('request');
var Flickr = require('flickrapi');
var interpolate = require('interpolate');

var DAYS_AGO = 1;
var TIMEZONE = 'Australia/Sydney';

// Handlebars
Handlebars.registerHelper('mins', function(value) {
	return Math.round(value/60);
});
Handlebars.registerHelper('googleKey', function(val1, val2) {
	return process.env.GOOGLE_KEY;
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
var flickrOptions = {
	api_key: process.env.FLICKR_API_KEY,
	secret: process.env.FLICKR_SECRET,
	user_id: process.env.FLICKR_USER_ID,
	access_token: process.env.FLICKR_ACCESS_TOKEN,
	access_token_secret: process.env.FLICKR_ACCESS_SECRET
};

var noteStore = evernote.getNoteStore();


function getFitbitData(url) {
	return fitbit.requestResource(url, 'GET', process.env.FITBIT_ACCESS_TOKEN, process.env.FITBIT_ACCESS_SECRET);
}

function makeNote(noteTitle, noteBody, parentNotebook) {
	var deferred = Q.defer();

	html2enml('<body>' + noteBody + '</body>', '', function(enml, res){
		var yesterday = moment().tz(TIMEZONE).subtract(DAYS_AGO, 'day').startOf('day');
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

function getPhotoUrl(options, size) {
	options.size = size || 'b';
	return interpolate('https://farm{farm}.staticflickr.com/{server}/{id}_{secret}_{size}.jpg', options);
}

function getMemories() {
	console.log('getMemories');

	var deferred = Q.defer();
	var filter = new Evernote.NoteFilter({
		words: interpolate('notebook:journal any: intitle:{dateFormat1} intitle:{dateFormat2}*', {
			dateFormat1: moment().tz(TIMEZONE).subtract(DAYS_AGO, 'day').format('DD/MM/'),
			dateFormat2: moment().tz(TIMEZONE).subtract(DAYS_AGO, 'day').format('DDMM')
		}),
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
			var noteUrl = 'https://www.evernote.com/shard/{shardId}/nl/{userId}/{noteGuid}/';
			data.notes.forEach(function(note){
				memories.push({
					link: interpolate(noteUrl, {
						shardId: process.env.EVERNOTE_SHARD_ID,
						userId: process.env.EVERNOTE_USER_ID,
						noteGuid: note.guid
					}),
					title: note.title
				});
			});
			noteStore.findNotesMetadata(foodFilter, 0, 10, noteSpec, function(error, data){
				data.notes.forEach(function(note){
					memories.push({
						link: interpolate(noteUrl, {
							shardId: process.env.EVERNOTE_SHARD_ID,
							userId: process.env.EVERNOTE_USER_ID,
							noteGuid: note.guid
						}),
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
	console.log('getMappiness');

	var deferred = Q.defer();
	request({ url: process.env.MAPPINESS_URL, json: true }, function (error, response, data) {
		if (error) {
			deferred.reject(new Error(error));
		} else {
			var a=0, h=0, r=0, logs = 0;
			var now = moment().tz(TIMEZONE).startOf('day');
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
	console.log('getStoryline');

	var deferred = Q.defer();
	moves.getStoryline({ trackPoints: true, date: moment().tz(TIMEZONE).subtract(DAYS_AGO, 'day') }, function(error, storylines) {
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
	console.log('getFitbit');

	var deferred = Q.defer();
	var yesterday = moment().tz(TIMEZONE).subtract(DAYS_AGO, 'day').format('YYYY-MM-DD');
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

function getPhotos() {
	console.log('getPhotos');

	var deferred = Q.defer();
	Flickr.authenticate(flickrOptions, function(error, flickr) {
		var yesterday = moment().tz(TIMEZONE).subtract(DAYS_AGO, 'days').startOf('day').unix();
		flickr.photos.search({
			user_id: flickrOptions.user_id,
			min_taken_date: yesterday,
			authenticated: true,
			media: 'photos',
			per_page: 500,
			sort: 'date-taken-asc'
		}, function(err, result) {
			if (err) {
				return deferred.reject(err);
			}
			var photos = result.photos.photo.map(function(photo){
				return getPhotoUrl(photo);
			});

			deferred.resolve(photos);
		});
	});
	return deferred.promise;
}


Q.all([
	getMemories(), getMappiness(), getStoryline(), getFitbit(), getPhotos()
]).spread(function(memories, mappiness, storyline, fitbit, photos){
	var noteTitle = moment().tz(TIMEZONE).subtract(DAYS_AGO, 'day').format('DD/MM/YYYY ddd');
	var noteBody = getTemplate({
		memories: memories,
		mappiness: mappiness,
		storyline: storyline,
		fitbit: fitbit,
		photos: photos
	});

	makeNote(noteTitle, noteBody).then(function(note){
		console.log('ok');
		process.exit(0);
	});
}).fail(function(){
	console.log(arguments);
});