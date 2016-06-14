var fs = require('fs');
var Handlebars = require('handlebars');
var Trello = require('node-trello');
var Q = require('q');

var template = fs.readFileSync('templates/cards.hbs', { encoding: 'utf-8' });
var getTemplate = Handlebars.compile(template);

var trello = new Trello(process.env.TRELLO_KEY, process.env.TRELLO_TOKEN);

var getCards = exports.getCards = function() {
	console.log('getCards');

	var deferred = Q.defer();
	trello.get('/1/boards/5754a61320343d72d5a884b9/lists', { 
		cards: 'open',
		card_fields: 'name',
		fields: 'name'
	}, function(err, data) {
		if (err) {
			return deferred.reject(err);
		}
		deferred.resolve(data);
	});

	return deferred.promise;
};

exports.getLongevityNote = function() {
	console.log('getLongevityNote');

	var deferred = Q.defer();
	getCards().then(function(cards) {
		var todo = cards.filter(function(list) { return list.name === 'To Do'; })[0];
		var inProgress = cards.filter(function(list) { return list.name === 'In progress'; })[0];
		var maintenance = cards.filter(function(list) { return list.name === 'Maintenance'; })[0];
		var ratio = (maintenance.cards.length + (0.5 * inProgress.cards.length) + (0.1 * todo.cards.length)) /
			(maintenance.cards.length + inProgress.cards.length + todo.cards.length);
		var roundedRatio = Math.round(ratio * 100) / 100;

		deferred.resolve(getTemplate({
			list1: todo,
			list2: inProgress,
			list3: maintenance,
			title: 'Longevity score: ' + roundedRatio
		}));
	}).catch(deferred.reject);

	return deferred.promise;
}
