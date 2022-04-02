'use strict';

// Import modules
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
	return res.render('membership/index.hbs', {
		title: "Membership",
		membership: [
			{
				name: 'Revolution',
				number: 'GOL0001',
				type: {
					id: 1,
					name: "Band"
				},
				labels: ['Northern']
			},
			{
				name: 'Phantom Knights',
				number: 'SIL0001',
				type: {
					id: 1,
					name: "Band"
				},
				labels: ['Midlands']
			},
			{
				name: 'Luke Taylor',
				number: 'IND0001',
				type: {
					id: 2,
					name: "Individual"
				},
				labels: []
			}
		]
	});
});

module.exports = {
	root: '/membership/',
	router: router
};
