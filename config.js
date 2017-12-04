var config = {};

config.mongodb = {};
config.web = {};
config.google_auth = {};
config.express = { session: {}};

config.mongodb.connectionstring = 'mongodb://host/databasename';
config.web.port = process.env.WEB_PORT || 8080;
config.google_auth.clientID = '********.apps.googleusercontent.com';
config.google_auth.clientSecret = '******CLIENT SECRET*******';
config.express.session.secret = '******SESSION SECRET*******';

module.exports = config;
