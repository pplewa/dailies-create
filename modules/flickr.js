var moment = require('moment-timezone');
var Q = require('q');
var Flickr = require('flickrapi');
var interpolate = require('interpolate');
var config = require('../config');

var flickrOptions = {
	api_key: process.env.FLICKR_API_KEY,
	secret: process.env.FLICKR_SECRET,
	user_id: process.env.FLICKR_USER_ID,
	access_token: process.env.FLICKR_ACCESS_TOKEN,
	access_token_secret: process.env.FLICKR_ACCESS_SECRET
};

function getPhotoUrl(options, size) {
	options.size = size || 'b';
	return interpolate('https://farm{farm}.staticflickr.com/{server}/{id}_{secret}_{size}.jpg', options);
}

exports.getPhotos = function() {
	console.log('getPhotos');

	var deferred = Q.defer();
	Flickr.authenticate(flickrOptions, function(error, flickr) {
		// adding ~10 hours for the Flickr time difference
		var yesterday = moment().tz(config.TIMEZONE).startOf('day')
			.subtract(config.DAYS_AGO, 'days').add(10, 'hours').unix();
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
