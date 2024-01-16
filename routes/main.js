'use strict';

// Import modules
const express = require('express');
const router = express.Router();
const Joi = require('joi');

const { Op } = require('sequelize');

const validator = require('@byba/express-validator');

const loginCfg = {
	title: 'Please Log In',
	layout: 'no-nav.hbs',
	background: '/assets/field-markings.jpg',
	darkenBG: true
};

router.get('/', (req, res) => {
	if (req.session.user) {
		return res.redirect(req.query.next ?? 'home');
	}

	return res.render('login', loginCfg);
});

router.post('/', validator.body(Joi.object({
	email: Joi.string()
		.email()
		.required(),
	password: Joi.string()
		.required()
})), validator.query(Joi.object({
	next: Joi.string()
})), async (req, res) => {
	const user = await req.db.User.findByEmail(req.body.email);

	// either returns if the password is valid, or undefined if no user was found
	const validLogin = await user?.validPassword(req.body.password);

	if (!validLogin) {
		return res.render('login', {
			...loginCfg,
			error: 'Username or password incorrect. Please try again',
			email: req.body.email
		});
	}

	req.session.user = user.dataValues;

	//noticed we don't always redirect to the ?next= page
	//logs show that it gets to next, gets bounced back here,
	//automagically bounces back again and so on, until the
	//session actually saves!
	req.session.save(() => {
		const nextPage = req.query.next ?? 'home';
		res.redirect(nextPage);
	});
});

router.get('/home', async (req, res) => {
	//set up various different bits
	const messages = [];
	const adminStats = [];

	const [events, season] = await Promise.all([
		req.db.Event.findAll({
			where: {
				Start: {
					[Op.gte]: new Date()
				}
			},
			include: [req.db.Address, {
				model: req.db.EventRegistration,
				include: [req.db.Organisation]
			}
			],
			order: [
				['Start']
			]
		}), req.db.Season.getCurrent()]);

	if (req.session.band) {
		const membership = await req.db.OrganisationMembership.findOne({
			where: {
				OrganisationId: req.session.band.id
			},
			include: [{
				model: req.db.Membership,
				where: {
					SeasonId: season?.id
				}
			}]
		});

		if (!membership) {
			messages.push({
				text: `${req.session.band.Name} is not currently in membership!`,
				level: 'warning'
			});
		}

		for (let i = events.length - 1; i >= 0; i--) {
			const e = events[i];

			e.canEnter = membership ? true : !e.MembersOnly;
			e.hasEntered = e.EventRegistrations.filter(er => er.Organisation.id === req.session.band.id).length > 0;

			if (!(e.canEnter || e.hasEntered)) {
				events.splice(i, 1);
			}
		}
	}

	if (req.session.user.IsAdmin) {
		const [bands, adminUsers, totalUsers] = await Promise.all([
			req.db.Organisation.count(),
			req.db.User.count({
				where: {
					IsAdmin: true
				}
			}),
			req.db.User.count()]);

		adminStats.push({
			title: 'Total Organisations',
			subtitle: 'Any season',
			value: bands,
			link: '/organisation/',
			class: bands == 0 ? 'bg-danger text-light' : bands < 5 ? 'bg-warning text-dark' : null
		});

		const adminPercent = Math.round(adminUsers / totalUsers * 100);
		adminStats.push({
			title: 'Admin Users',
			subtitle: 'Any season',
			value: `${adminUsers} (${adminPercent}%)`,
			class: adminPercent > 50 ? 'bg-danger text-light' : adminPercent < 10 ? 'bg-success text-light' : null,
			link: '/user/'
		});

		if (season) {
			const [nextSeason, membership] = await Promise.all([req.db.Season.findOne({
				where: {
					Start: {
						[Op.gt]: season.End
					}
				},
				order: [['Start']]
			}),
			season.getMemberships()
			]);

			if (nextSeason) {
				const diffDays = Math.ceil((nextSeason.Start - season.End) / (1000 * 60 * 60 * 24));
				if (diffDays > 1) {
					messages.push({
						text: `There is a gap of ${diffDays} days between the end of the current season and the start of the next one. Most pages require an active season.`,
						link: '/config/season/',
						level: 'warning'
					});
				}
			} else {
				const diffDays = Math.ceil((season.End - new Date()) / (1000 * 60 * 60 * 24));
				if (diffDays < 30) {
					messages.push({
						text: `The current season ends in ${diffDays} days, and there is no next season configured. Most pages require an active season.`,
						link: '/config/season/',
						level: 'warning'
					});
				}
			}

			if (!membership.length) {
				messages.push({
					text: 'There are no members!',
					link: '/membership/',
					level: 'danger'
				});
			}

			adminStats.push({
				title: 'Membership',
				subtitle: `${season.Identifier} season`,
				value: membership.length,
				link: '/membership/',
				class: membership.length < 4 ? 'bg-danger text-light' : membership.length >= 10 ? 'bg-success text-light' : null
			});
		} else {
			adminStats.push({
				title: 'Membership',
				value: 0,
				link: '/membership/'
			});

			messages.push({
				text: 'There is no current season configured. Most pages require an active season!',
				link: '/config/season/',
				level: 'danger'
			});
		}
	}

	const hasFunctionality = req.session.user.IsAdmin || req.session.band != null;

	return res.render('index', {
		title: 'Home',
		hasFunctionality,
		events,
		messages,
		adminStats,
	});
});

router.get('/logout', (req, res, next) => {
	req.session.user = null;
	req.session.band = null;
	req.session.destroy(() => {
		res.redirect('/');
	});
});

router.get('/password-reset/:userId', validator.params(Joi.object({
	userId: Joi.string()
		.guid()
		.required()
})), async (req, res, next) => {
	const user = await req.db.User.findByPk(req.params.userId);

	if (!user) {
		return next();
	}

	return res.render('passwordReset.hbs', {
		title: 'Reset Password',
		user
	});
});

router.post('/change-band', validator.body(Joi.object({
	changeBand: Joi.number()
		.required()
})), (req, res, next) => {
	const band = req.session.user.bands.filter(b => b.id === req.body.changeBand);

	if (band.length > 0) {
		req.session.band = band[0];
	}

	return res.redirect('back');
});

router.all('/no-access', validator.query(Joi.object({
	page: Joi.string()
})), (req, res, next) => {
	return res.render('no-access.hbs', {
		title: 'No Access',
		previousPage: req.query.page ?? ''
	});
});

module.exports = {
	root: '/',
	router: router
};
