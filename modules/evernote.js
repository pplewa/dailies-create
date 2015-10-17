var Evernote = require('evernote').Evernote;
var html2enml = require('html2enml2').convert;
var moment = require('moment-timezone');
var Q = require('q');
var interpolate = require('interpolate');
var config = require('../config');

var evernote = new Evernote.Client({ token: process.env.EVERNOTE_TOKEN, sandbox: false });
var noteStore = evernote.getNoteStore();

exports.createNote = function(noteTitle, noteBody, parentNotebook) {
	var deferred = Q.defer();

	html2enml('<body>' + noteBody + '</body>', '', function(enml, res){
		var yesterday = moment().tz(config.TIMEZONE).subtract(config.DAYS_AGO, 'day').startOf('day');
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
