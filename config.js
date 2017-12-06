var config = {};

config.mongodb = {};
config.web = {};
config.google_auth = {};

config.mongodb.connectionstring = 'mongodb://host/databasename';
config.web.port = process.env.WEB_PORT || 8080;
/* 
  get these next two settings from Google by going to console.cloud.google.com, selecting 
  (or creating) a project, choosing "API's and Services", "Credentials", "Create credentials",
  "Oauth client ID"
  */
config.google_auth.clientID = '********.apps.googleusercontent.com';
config.google_auth.clientSecret = '******CLIENT SECRET*******';
/* 
  this is configured in console.cloud.google.com in the same place as the last two, 
  as "Authorized redirect URIs" 
  */
config.google_auth.returnURL = 'https://example.com/login/google/return'; 
config.jwtSecret = '******JWT SECRET******'; /* generate random string */

module.exports = config;
