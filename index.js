var Handlebars = require('handlebars');
var moment = require('moment-timezone');
var fs = require('fs');
var Q = require('q');
var config = require('./config');
var getStoryline = require('./modules/moves').getStoryline;
var getMappiness = require('./modules/mappiness').getMappiness;
var getPhotos = require('./modules/flickr').getPhotos;
var getFitbitData = require('./modules/fitbit').getFitbitData;
var getMemories = require('./modules/evernote').getMemories;
var createNote = require('./modules/evernote').createNote;

// Handlebars
Handlebars.registerHelper('mins', function(value) {
	return Math.round(value / 60);
});
Handlebars.registerHelper('round', function(value) {
	return Math.round(value * 100) / 100;
});
Handlebars.registerHelper('googleKey', function(val1, val2) {
	return process.env.GOOGLE_KEY || '';
});
Handlebars.registerHelper('upperCase', function(value) {
	return value.toLowerCase().replace(/\b[a-z]/g, function(letter) {
		return letter.toUpperCase();
	}).replace('_', ' ');
});
var template = fs.readFileSync('templates/daily.hbs', { encoding: 'utf-8' });
var getTemplate = Handlebars.compile(template);


Q.all([
	getMemories(), getMappiness(), getStoryline(), getFitbitData(), getPhotos()
]).spread(function(memories, mappiness, storyline, fitbit, photos){
	var noteTitle = moment().tz(config.TIMEZONE)
		.subtract(config.DAYS_AGO, 'day').format('DD/MM/YYYY ddd');
	var noteBody = getTemplate({
		memories: memories,
		mappiness: mappiness,
		storyline: storyline,
		fitbit: fitbit,
		photos: photos
	});

	var yesterday = moment().tz(config.TIMEZONE).subtract(config.DAYS_AGO, 'day').startOf('day');
	var tags = ['Journal', yesterday.format('YYYY'), yesterday.format('MMMM'), yesterday.format('dddd')];
	createNote(noteTitle, noteBody, tags, yesterday.valueOf()).then(function(note){
		console.log('ok');
		process.exit(0);
	});
}).catch(function(error){
	console.log(error);
});
