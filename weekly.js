var Handlebars = require('handlebars');
var fs = require('fs');
var Q = require('q');
var moment = require('moment-timezone');
var config = require('./config');
var createNote = require('./modules/evernote').createNote;
var createEmptyNote = require('./modules/evernote').createEmptyNote;
var getBooks = require('./modules/evernote').getBooks;
var getArticles = require('./modules/evernote').getArticles;
var getVideos = require('./modules/evernote').getVideos;
var getPodcasts = require('./modules/evernote').getPodcasts;
var getLongevityNote = require('./modules/trello').getLongevityNote;
var getWeeklyStoryline = require('./modules/moves').getWeeklyStoryline;

var template = fs.readFileSync('templates/weekly.hbs', { encoding: 'utf-8' });
var getTemplate = Handlebars.compile(template);

var yesterday = moment().tz(config.TIMEZONE).subtract(config.DAYS_AGO, 'day').startOf('day');
var createdDate = yesterday.valueOf() + 1;
var tags = ['Journal', 'Review', yesterday.format('YYYY'), yesterday.format('MMMM'), yesterday.format('dddd')];
var noteTitle = 'Weekly Roundup for ' + yesterday.format('DD/MM/YYYY');

getLongevityNote().then(function(noteBody) {
	Q.all([
		getWeeklyStoryline(),
		getBooks(),
		getArticles(),
		getVideos(),
		getPodcasts(),
		createEmptyNote(noteTitle, tags, createdDate, 'finance'),
		createEmptyNote(noteTitle, tags, createdDate, 'fitbit'),
		createEmptyNote(noteTitle, tags, createdDate, 'atlassian'),
		createNote(noteTitle, noteBody, tags, createdDate, 'longevity')
	]).spread(function(storyline, books, articles, videos, podcasts, finance, fitbit, work, longevity){
		var noteBody = getTemplate({
			traces: storyline,
			books: books,
			articles: articles,
			videos: videos,
			podcasts: podcasts,
			finance: finance,
			fitbit: fitbit,
			work: work,
			longevity: longevity
		});

		createNote(noteTitle, noteBody, tags, createdDate).then(function(note){
			console.log('ok');
			process.exit(0);
		}).catch(function(error){
			console.log(error);
		});

	}).catch(function(err){
		console.log(err)
	});
});