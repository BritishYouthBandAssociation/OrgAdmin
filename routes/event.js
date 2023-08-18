'use strict';

/* global __lib */

const express = require('express');

const router = express.Router();

router.get('/', (_, res) => {
	return res.render('event/index.hbs', {
		title: 'Events'
	});
});

router.get('/new', (_, res) => {
	return res.render('event/add.hbs', {
		title: 'Add New Event',
	});
});

router.get('/:id', (req, res) => {
	return res.render('event/view.hbs', {
		title: 'Loading...',
		id: req.params.id
	});
});


module.exports = {
	root: '/event',
	router: router
};
