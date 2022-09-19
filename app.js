'use strict';

// Import modules
const express = require('express');
const { engine } = require('express-handlebars');
const fs = require('fs');
const morgan = require('morgan');
const path = require('path');
const serveFavicon = require('serve-favicon');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const os = require('os');
const formData = require('express-form-data');

// Initialise library path
const libPath = path.join(__dirname, process.env.LIB_PATH ?? '../Library');
global.__lib = libPath;

// Import library functions
const {
	helpers: {
		ConfigHelper,
		HandlebarsHelper
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

	// Add logging middleware
	if (serverOptions.logging) {
		app.use(morgan('tiny', {
			// don't log out static files and unnecessary fluff
			skip: (req, res) => {
				return /(^\/(js|css|fonts|assets|favicon)|(png|jpg|css))/.test(req.path);
			}
		}));
	}

	// Set up handlebars templating engine
	app.engine(
		'hbs',
		engine({
			extname: '.hbs',
			helpers: HandlebarsHelper,
			runtimeOptions: {
				allowProtoPropertiesByDefault: true,
				allowProtoMethodsByDefault: true
			}
		})
	);
	app.set('view engine', 'hbs');
	app.set('views', path.join(__dirname, 'views'));

	//allow file uploads
	app.use(formData.parse({
		uploadDir: os.tmpdir(),
		autoClean: true
	}));
	app.use(formData.format());

	// Set up parsers to allow access to POST bodies
	app.use(express.json());
	app.use(express.urlencoded({
		extended: true
	}));

	// Set up routes for static files
	app.use(serveFavicon(
		path.join(__dirname, 'public/assets/favicon.ico')));

	// Serve the production vue script if in production environment
	app.get('/js/vue.js', (req, res, next) => {
		if (process.env.NODE_ENV === 'production') {
			return res.redirect('/js/vue.min.js');
		}

		next();
	});

	app.use(express.static(path.join(__dirname, 'public')));

	// Serve uploads locally
	if (serverOptions.serveUploads) {
		app.use('/uploads', express.static(path.resolve(serverOptions.uploadPath)));
	}

	// Get database models and connection
	const dbPath = path.join(libPath, 'models');
	const db = await require(dbPath)(path.join(__dirname, 'config/db'));

	//add global db
	app.use((req, res, next) => {
		req.db = db;
		next();
	});

	//... and use it for our session stuff too!
	const sessionStore = new SequelizeStore({ db: db.sequelize });
	await sessionStore.sync();

	const sessionConfig = ConfigHelper.importJSON(path.join(__dirname, 'config'), 'session');
	sessionConfig.store = sessionStore;

	app.use(session(sessionConfig));

	//prevent unauthorised access
	app.use(async (req, res, next) => {
		//allow css/css.map/js files
		if (/\.(css|js|css\.map)$/.test(req.path)) {
			return next();
		}

		if (!req.session.user) {
			if (!serverOptions.noAuthRequired.includes(req.path)) {
				return res.redirect(`/?next=${req.path}`);
			}
		} else {
			req.session.user = await req.db.User.findOne({
				where: {
					id: req.session.user.id
				}
			});

			req.session.user.bands = await req.db.Organisation.findAll({
				include: [{
					model: req.db.OrganisationUser,
					where: {
						UserId: req.session.user.id
					},
					attributes: []
				}],
				where: {
					OrganisationTypeId: 1 //we only want associated bands here
				}
			});

			if (!req.session.user.bands.some(b => b.id === req.session.band?.id)) {
				req.session.band = null;
			}

			if (!req.session.band) {
				if (req.session.user.bands.length > 0) {
					req.session.band = req.session.user.bands[0];
				}
			}

			const resetPath = `/user/${req.session.user.id}`;
			if (req.session.user.ForcePasswordReset && !req.path.startsWith(resetPath)){
				res.redirect(resetPath);
				return;
			}
		}

		next();
	});

	//init locals (for Handlebars)
	app.use((req, res, next) => {
		res.locals.page = req.path.toLowerCase();
		res.locals.session = req.session;

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
