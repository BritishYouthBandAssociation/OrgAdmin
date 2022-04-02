'use strict';

// Import modules
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
	return res.render('membership/index.hbs', {
		title: "Membership",
		seasons: [2022],
		season: 2022,
		membership: [
			{
				name: 'Revolution',
				number: 'GOL0001',
				type: 1,
				labels: [{
					id: 1,
					name: 'Band',
					background: '#FF0',
					foreground: '#000'
				}, {
					id: 3,
					name: 'Northern',
					background: '#0F0',
					foreground: '#FFF'
				}]
			},
			{
				name: 'Phantom Knights',
				number: 'SIL0001',
				type: 1,
				labels: [{
					id: 1,
					name: 'Band',
					background: '#FF0',
					foreground: '#000'
				}, {
					id: 4,
					name: 'Midlands',
					background: '#F00',
					foreground: '#FFF'
				}]
			},
			{
				name: 'Luke Taylor',
				number: 'IND0001',
				type: 2,
				labels: [{
					id: 2,
					name: 'Individual',
					background: '#00F',
					foreground: '#FFF'
				}]
			}
		],
		filters: [{
			id: 1,
			name: 'Band',
			background: '#FF0',
			foreground: '#000'
		}, {
			id: 2,
			name: 'Individual',
			background: '#00F',
			foreground: '#FFF'
		}, {
			id: 3,
			name: 'Northern',
			background: '#0F0',
			foreground: '#FFF'
		}, {
			id: 4,
			name: 'Midlands',
			background: '#F00',
			foreground: '#FFF'
		}]
	});
});

module.exports = {
	root: '/membership/',
	router: router
};