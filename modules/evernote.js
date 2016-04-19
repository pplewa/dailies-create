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
			dateFormat1: moment().tz(config.TIMEZONE).subtract(config.DAYS_AGO - 1, 'day').format('DD/MM/'),
			dateFormat2: moment().tz(config.TIMEZONE).subtract(config.DAYS_AGO - 1, 'day').format('DDMM')
		}),
		order: Evernote.NoteSortOrder.CREATED,
		ascending: false,
		timeZone: config.TIMEZONE
	});

	var foodFilter = new Evernote.NoteFilter({
		words: interpolate('notebook:Food created:{dateFormat1} -created:{dateFormat2}', {
			dateFormat1: moment().tz(config.TIMEZONE).subtract(config.DAYS_AGO, 'day').format('YYYYMMDD'),
			dateFormat2: moment().tz(config.TIMEZONE).subtract(config.DAYS_AGO - 1, 'day').format('YYYYMMDD')
		}),
		order: Evernote.NoteSortOrder.CREATED,
		ascending: true,
		timeZone: config.TIMEZONE
	});
	var noteSpec = new Evernote.NotesMetadataResultSpec({
		includeTitle: true,
		includeCreated: true
	})
	noteStore.findNotesMetadata(filter, 0, 20, noteSpec, function(error, data){
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
					created: note.created,
					title: note.title
				});
			});
			noteStore.findNotesMetadata(foodFilter, 0, 10, noteSpec, function(error, data){
				data.notes.forEach(function(note){
					memories.push({
						food: true,
						link: interpolate(noteUrl, {
							shardId: process.env.EVERNOTE_SHARD_ID,
							userId: process.env.EVERNOTE_USER_ID,
							noteGuid: note.guid
						}),
						created: note.created,
						title: note.title
					});
				});
				deferred.resolve(memories);
			});
		}
	});
	return deferred.promise;
}

exports.getNowNote = function() {
	console.log('getNowNote');

	var deferred = Q.defer();
	var nowGuid = 'd709548b-d5bd-4863-81f8-22caa47cd799';
	noteStore.getNote(nowGuid, true, false, false, false, function(error, data){
		if (error) {
			deferred.reject(new Error(error));
		} else {
			var now = data.content.match(/<ul>([\s\S]*?)<\/ul>/)[1].replace(/li>/g, 'div>');
			var done = now.split('checked="true').length - 1; 
			var todos = now.split('<en-todo').length - 1;

			deferred.resolve({
				content: now,
				productivity: +(done/todos).toFixed(3) + ' ' + 
					['😫', '😟', '😐', '😌', '😀'][Math.round(+(done/todos)*5)-1]
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
			dateFrom: moment().tz(config.TIMEZONE).startOf('day').subtract(Number(config.DAYS_AGO) + 7, 'day').format('YYYYMMDD'),
			dateTo: moment().tz(config.TIMEZONE).endOf('day').subtract(Number(config.DAYS_AGO) - 1, 'day').format('YYYYMMDD')
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
			dateFrom: moment().tz(config.TIMEZONE).startOf('day').subtract(Number(config.DAYS_AGO) + 7, 'day').format('YYYYMMDD'),
			dateTo: moment().tz(config.TIMEZONE).endOf('day').subtract(Number(config.DAYS_AGO) - 1, 'day').format('YYYYMMDD')
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
			dateFrom: moment().tz(config.TIMEZONE).startOf('day').subtract(Number(config.DAYS_AGO) + 7, 'day').format('YYYYMMDD'),
			dateTo: moment().tz(config.TIMEZONE).endOf('day').subtract(Number(config.DAYS_AGO) - 1, 'day').format('YYYYMMDD')
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
			dateFrom: moment().tz(config.TIMEZONE).startOf('day').subtract(Number(config.DAYS_AGO) + 7, 'day').format('YYYYMMDD'),
			dateTo: moment().tz(config.TIMEZONE).endOf('day').subtract(Number(config.DAYS_AGO) - 1, 'day').format('YYYYMMDD')
		}),
		order: Evernote.NoteSortOrder.CREATED,
		ascending: false
	})).then(deferred.resolve).catch(deferred.reject);
	return deferred.promise;
}
