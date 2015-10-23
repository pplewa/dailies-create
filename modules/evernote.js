var Evernote = require('evernote').Evernote;
var html2enml = require('html2enml2').convert;
var moment = require('moment-timezone');
var Q = require('q');
var interpolate = require('interpolate');
var config = require('../config');

var evernote = new Evernote.Client({ token: process.env.EVERNOTE_TOKEN, sandbox: false });
var noteStore = evernote.getNoteStore();

exports.createNote = function(noteTitle, noteBody, tags, created) {
	var deferred = Q.defer();

	html2enml('<body>' + noteBody + '</body>', '', function(enml, res){
		var ourNote = new Evernote.Note({
			title: noteTitle,
			tagNames: tags || [],
			content: enml,
			created: created || null,
			resources: res
		});

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

exports.createEmptyNote = function(noteTitle, tags, created, notebookName) {
	var deferred = Q.defer();
	var note = new Evernote.Note({
		title: noteTitle,
		tagNames: tags || [],
		created: created || null
	});
	if (notebookName) {
		noteStore.listNotebooks(function(err, notebooks) {
			if (err) {
				return deferred.reject(new Error(err));
			}
			var notebookGuid = null;
			notebooks.some(function(notebook){
				if (notebook.name.toLowerCase() === notebookName.toLowerCase()) {
					notebookGuid = notebook.guid;
					return true;
				}
			});
			if (notebookGuid) {
				note.notebookGuid = notebookGuid;
			}
			noteStore.createNote(note, function(error, note) {
				if (error) {
					return deferred.reject(new Error(error));
				} 
				var noteUrl = 'evernote:///view/{userId}/{shardId}/{noteGuid}/{noteGuid}/';
				deferred.resolve({
					title: noteTitle,
					link: interpolate(noteUrl, {
						shardId: process.env.EVERNOTE_SHARD_ID,
						userId: process.env.EVERNOTE_USER_ID,
						noteGuid: note.guid
					})
				});
			});
		});
	} else {
		noteStore.createNote(note, function(error, note) {
			if (error) {
				return deferred.reject(new Error(error));
			} 
			deferred.resolve(note);
		});
	}
	return deferred.promise;
}

exports.getMemories = function() {
	console.log('getMemories');

	var deferred = Q.defer();
	var filter = new Evernote.NoteFilter({
		words: interpolate('notebook:journal any: intitle:{dateFormat1} intitle:{dateFormat2}*', {
			dateFormat1: moment().tz(config.TIMEZONE).subtract(config.DAYS_AGO, 'day').format('DD/MM/'),
			dateFormat2: moment().tz(config.TIMEZONE).subtract(config.DAYS_AGO, 'day').format('DDMM')
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

function getNotesWithFilter(filter) {
	var deferred = Q.defer();
	var noteSpec = new Evernote.NotesMetadataResultSpec({
		includeTitle: true
	})
	noteStore.findNotesMetadata(filter, 0, 50, noteSpec, function(error, data){
		if (error) {
			deferred.reject(new Error(error));
		} else {
			var memories = [];
			var noteUrl = 'evernote:///view/{userId}/{shardId}/{noteGuid}/{noteGuid}/';
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
		}
	});
	return deferred.promise;
}

exports.getBooks = function() {
	console.log('getBooks');
	var deferred = Q.defer();
	getNotesWithFilter(new Evernote.NoteFilter({
		words: interpolate('notebook:books created:{dateFrom} -created:{dateTo}', {
			dateFrom: moment().tz(config.TIMEZONE).subtract(Number(config.DAYS_AGO) + 6, 'day').format('YYYYMMDD'),
			dateTo: moment().tz(config.TIMEZONE).subtract(Number(config.DAYS_AGO) - 1, 'day').format('YYYYMMDD')
		}),
		order: Evernote.NoteSortOrder.CREATED,
		ascending: false
	})).then(deferred.resolve).catch(deferred.reject);
	return deferred.promise;
}

exports.getArticles = function() {
	console.log('getArticles');
	var deferred = Q.defer();
	getNotesWithFilter(new Evernote.NoteFilter({
		words: interpolate('notebook:pocket created:{dateFrom} -created:{dateTo}', {
			dateFrom: moment().tz(config.TIMEZONE).subtract(Number(config.DAYS_AGO) + 6, 'day').format('YYYYMMDD'),
			dateTo: moment().tz(config.TIMEZONE).subtract(Number(config.DAYS_AGO) - 1, 'day').format('YYYYMMDD')
		}),
		order: Evernote.NoteSortOrder.CREATED,
		ascending: false
	})).then(deferred.resolve).catch(deferred.reject);
	return deferred.promise;
}

exports.getVideos = function() {
	console.log('getVideos');
	var deferred = Q.defer();
	getNotesWithFilter(new Evernote.NoteFilter({
		words: interpolate('notebook:videos created:{dateFrom} -created:{dateTo}', {
			dateFrom: moment().tz(config.TIMEZONE).subtract(Number(config.DAYS_AGO) + 6, 'day').format('YYYYMMDD'),
			dateTo: moment().tz(config.TIMEZONE).subtract(Number(config.DAYS_AGO) - 1, 'day').format('YYYYMMDD')
		}),
		order: Evernote.NoteSortOrder.CREATED,
		ascending: false
	})).then(deferred.resolve).catch(deferred.reject);
	return deferred.promise;
}

exports.getPodcasts = function() {
	console.log('getPodcasts');
	var deferred = Q.defer();
	getNotesWithFilter(new Evernote.NoteFilter({
		words: interpolate('notebook:podcasts created:{dateFrom} -created:{dateTo}', {
			dateFrom: moment().tz(config.TIMEZONE).subtract(Number(config.DAYS_AGO) + 6, 'day').format('YYYYMMDD'),
			dateTo: moment().tz(config.TIMEZONE).subtract(Number(config.DAYS_AGO) - 1, 'day').format('YYYYMMDD')
		}),
		order: Evernote.NoteSortOrder.CREATED,
		ascending: false
	})).then(deferred.resolve).catch(deferred.reject);
	return deferred.promise;
}
