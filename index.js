var express = require('express');
var passport = require('passport');
var Strategy = require('passport-google-oauth20').Strategy;

var config = require('./config');

// Configure the Google strategy for use by Passport.
//
// OAuth 2.0-based strategies require a `verify` function which receives the
// credential (`accessToken`) for accessing the Google API on the user's
// behalf, along with the user's profile.  The function must invoke `cb`
// with a user object, which will be set at `req.user` in route handlers after
// authentication.
passport.use(new Strategy({
    clientID: config.google_auth.clientID,
    clientSecret: config.google_auth.clientSecret,
    callbackURL: '/login/google/return',
    returnURL: '/login/google/return'
  },
  function(accessToken, refreshToken, profile, cb) {
    // In this example, the user's Google profile is supplied as the user
    // record.  In a production-quality application, the Google profile should
    // be associated with a user record in the application's database, which
    // allows for account linking and authentication with other identity
    // providers.
    //console.log(profile);
    User.findOne({ google_id: profile.id }).populate('friends').exec(function(err, user) {
      if (!user) {
        user = new User({ displayName: profile.displayName, google_id: profile.id, photos: profile.photos });
        user.save(function(user) {
          return cb(err, user);
        });
      } else {
        return cb(err, user);
      }
    });
  }));


// Configure Passport authenticated session persistence.
//
// In order to restore authentication state across HTTP requests, Passport needs
// to serialize users into and deserialize users out of the session.  In a
// production-quality application, this would typically be as simple as
// supplying the user ID when serializing, and querying the user record by ID
// from the database when deserializing.  However, due to the fact that this
// example does not have a database, the complete Google profile is serialized
// and deserialized.
passport.serializeUser(function(user, cb) {
  cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
  cb(null, obj);
});


// Create a new Express application.
var app = express();

// Configure view engine to render EJS templates.
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

// Use application-level middleware for common functionality, including
// logging, parsing, and session handling.
app.use(require('morgan')('combined'));
app.use(require('cookie-parser')());
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require('express-session')({ secret: config.express.session.secret, resave: true, saveUninitialized: true }));

// Initialize Passport and restore authentication state, if any, from the
// session.
app.use(passport.initialize());
app.use(passport.session());


// Define routes.
app.get('/',
  function(req, res) {
    if (req.user) {
      User.findOne({ _id: req.user._id }).populate('friends').exec(function(err, user) {
        res.render('home', { user: user });
      });
    } else {
      res.render('home', { user: req.user });
    }
  });

app.get('/login',
  function(req, res){
    res.render('login');
  });

app.get('/login/google',
  passport.authenticate('google', { scope: ['profile'] }));

app.get('/login/google/return', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });

app.post('/gifts',
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res){
    var gift = new Gift({ description: req.body.description, url: req.body.url });
    var user = User.findOne({ _id: req.user._id }, function(err, user) {
      if (err)
        return next(err);
      if (!user)
        return res.status(500).send({status:500, message: 'No such user', type:'internal'});
      user.gifts.push(gift);
      user.save(function(err) {
        if (err)
          return next(err);
        res.redirect('/');
      });
    });
  });

app.post('/friends',
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res){
    User.findOne({ google_id: req.body.google_id }, function(err, friend) {
      if (err)
        return res.send(err);
      if (!friend)
        return res.status(500).send({status:500, message: 'No such friend', type:'internal'});
      User.findOne({ _id: req.user._id }, function(err, user) {
        if (err)
          return res.send(err);
        if (!user)
          return res.status(500).send({status:500, message: 'No such user', type:'internal'});
        user.friends.push(friend);
        user.save(function(err) {
          if (err)
            return next(err);
          res.redirect('/');
        });
      });
    });
  });

app.get('/friends/:google_id', 
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res){
    User.findOne({ google_id: req.params.google_id }, function(err, user) {
      if (err)
        return res.send(err);
      if (!user)
        return res.status(500).send({status:500, message: 'No such user', type:'internal'});
      res.render('friend', { friend: user });
    });
  });
// set up database
var mongoose = require('mongoose');
mongoose.connect(config.mongodb.connectionstring);

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  // we're connected!
  console.log('Connected to database');
});

var giftSchema = mongoose.Schema({
  description: String,
  url: String,
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completedDate: Date
},{ timestamps: true });
var Gift = mongoose.model('Gift', giftSchema);

var userSchema = mongoose.Schema({
  displayName: String,
  google_id: { type: String, index: true },
  photos: [mongoose.Schema.Types.Mixed],
  gifts: [giftSchema],
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
},{ timestamps: true });
var User = mongoose.model('User', userSchema);

app.listen(config.web.port);
