'use strict';

// Import modules
const express = require('express');
const { engine } = require('express-handlebars');
const fs = require('fs');
const path = require('path');
const serveFavicon = require('serve-favicon');
const session = require('express-session');
const dbSession = require('express-mysql-session')(session);

// Initialise library path
const libPath = path.join(__dirname, process.env.LIB_PATH ?? '../lib');
global.__lib = libPath;

// Import library functions
const {
	helpers: {
		ConfigHelper,
		HandlebarsHelper,
		DatabaseConnectionPool
	}
} = require(libPath);

//set global base dir
global.__approot = __dirname;

/**
 * loadRoutes() Loads all of the routes from /routers into a map
 *
 * @return {Array<Array<String, Object>>} All of the routes
 */
function loadRoutes() {
	const routes = [];

	const routeFiles = fs.readdirSync(path.join(__dirname, 'routes'))
		.filter(file => file.endsWith('.js'));

	for (const file of routeFiles) {
		const route = require(path.join(__dirname, 'routes', file));
		routes.push([route.root, route.router]);
	}

	return routes;
}

async function main() {
	// Initialise express app
	const app = express();

	// Import configuration
	const serverOptions = ConfigHelper.importJSON(path.join(__dirname, 'config'), 'server');

	// Set up handlebars templating engine
	app.engine(
		'hbs',
		engine({
			extname: '.hbs',
			helpers: HandlebarsHelper
		})
	);
	app.set('view engine', 'hbs');
	app.set('views', path.join(__dirname, 'views'));

	// Set up parsers to allow access to POST bodies
	app.use(express.json());
	app.use(express.urlencoded({
		extended: true
	}));

	// Set up routes for static files
	app.use(serveFavicon(
		path.join(__dirname, 'public/assets/favicon.ico')));
	app.use(express.static(path.join(__dirname, 'public')));

	//add global db pool
	const dbConfig = ConfigHelper.importJSON(path.join(__dirname, 'config'), 'db');
	const db = await new DatabaseConnectionPool(dbConfig);
	app.use((req, res, next) => {
		req.db = db;
		next();
	});

	//... and use it for our session stuff too!
	const sessionStore = new dbSession({}, db.pool);
	const sessionConfig = ConfigHelper.importJSON(path.join(__dirname, 'config'), 'session');
	sessionConfig.store = sessionStore;
	app.use(session(sessionConfig));

	//prevent unauthorised access
	app.use((req, res, next) => {
		//allow css/js files
		if (req.path.slice(req.path.length - 4) === ".css" || req.path.slice(req.path.length - 3) === ".js") {
			return next();
		}

		//double equals to also check for undefined
		if (req.session.user == null && !serverOptions.noAuthRequired.includes(req.path)) {
			return res.redirect(`/?next=${req.path}`);
		}

		next();
	});

	//init locals (for Handlebars)
	app.use((req, res, next) => {
		res.locals.page = req.path;

		next();
	});

	// Add external routers to express
	for (const route of loadRoutes()) {
		app.use(route[0], route[1]);
	}

	/*
	 * If the request gets to the bottom of the route stack, it doesn't
	 * have a defined route and therefore a HTTP status code 404 is sent
	 * and an error page shown
	 */
	app.use((req, res) => {
		res.status(404).render('error', {
			title: 'Error',
			code: 404,
			msg: 'Page Not Found'
		});
	});

	// Start the server
	app.listen(serverOptions.port, () => {
		console.log(`Server listening on :${serverOptions.port}`);
	});
}

main();
