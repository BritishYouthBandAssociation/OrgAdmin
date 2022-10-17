'use strict';

const express = require('express');
const Joi = require('joi');
const { Op } = require('sequelize');

const validator = require('@byba/express-validator');

const router = express.Router();

const replaceMessageTokens = (msg, user, org) => {
	const tokens = {
		firstName: user.FirstName,
		lastName: user.Surname,
		bandName: org?.Name ?? 'your band'
	};

	for (const [k, v] of Object.entries(tokens)) {
		msg = msg.replaceAll(`{${k}}`, v);
	}

	return msg;
};

router.get('/', validator.query(Joi.object({
	success: Joi.boolean()
})), async (req, res, next) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect('/no-access');
	}

	const [types, season] = await Promise.all([req.db.MembershipType.findAll({
		where: {
			IsActive: true
		}
	}), req.db.Season.findOne({
		where: {
			Start: {
				[Op.lte]: Date.now()
			},
			End: {
				[Op.gte]: Date.now()
			}
		}
	})]);

	if (!season) {
		return res.redirect(`/config/season?needsSeason=true&next=${req.originalUrl}`);
	}

	return res.render('email/index.hbs', {
		title: 'Bulk Emailer',
		types: types,
		season: season.id,
		recipients: [],
		success: req.query.success ?? false
	});
});

router.post('/test', validator.body(Joi.object({
	membership: Joi.array()
		.items(Joi.number())
		.required(),
	sender: Joi.string()
		.required(),
	subject: Joi.string()
		.required(),
	message: Joi.string()
		.required()
})), async (req, res, next) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect('/no-access');
	}

	const t = await req.db.sequelize.transaction();
	const msg = await req.db.Message.create({
		Sender: req.body.sender,
		Subject: req.body.subject,
		Body: replaceMessageTokens(req.body.message, req.session.user, req.session.band)
	}, {
		transaction: t
	});

	await req.db.Recipient.create({
		Name: req.session.user.FullName,
		EmailAddress: req.session.user.Email,
		MessageId: msg.id
	}, {
		transaction: t
	});

	await t.commit();

	const [types, season, rawMember] = await Promise.all([req.db.MembershipType.findAll({
		where: {
			IsActive: true
		}
	}), req.db.Season.findOne({
		where: {
			Start: {
				[Op.lte]: Date.now()
			},
			End: {
				[Op.gte]: Date.now()
			}
		}
	}),
	req.db.Membership.findAll({
		include: [
			req.db.Label,
			req.db.MembershipType,
			{
				model: req.db.IndividualMembership,
				include: [req.db.User]
			},
			{
				model: req.db.OrganisationMembership,
				include: {
					model: req.db.Organisation,
					include: [req.db.OrganisationType]
				}
			}
		],
		where: {
			id: {
				[Op.in]: req.body.membership
			}
		}
	})
	]);

	if (!season) {
		return res.redirect(`/config/season?needsSeason=true&next=${req.originalUrl}`);
	}

	const recipients = rawMember.map(m => {
		return {
			MembershipID: m.id,
			DisplayName: m.Name,
			IsSelected: true,
			IsSelectable: false
		};
	});

	return res.render('email/index.hbs', {
		title: 'Bulk Emailer',
		types,
		season: season.id,
		subject: req.body.subject,
		message: req.body.message,
		recipients,
		success: true
	});
});

router.post('/send', validator.body(Joi.object({
	membership: Joi.array()
		.items(Joi.number())
		.required(),
	sender: Joi.string()
		.required(),
	subject: Joi.string()
		.required(),
	message: Joi.string()
		.required()
})), async (req, res, next) => {
	if (!req.session.user.IsAdmin) {
		return res.redirect('/no-access');
	}

	const t = await req.db.sequelize.transaction();

	try {
		await Promise.all(req.body.membership.map(async m => {
			const member = await req.db.Membership.findByPk(m, {
				include: [
					req.db.Label,
					req.db.MembershipType,
					{
						model: req.db.IndividualMembership,
						include: [req.db.User]
					},
					{
						model: req.db.OrganisationMembership,
						include: {
							model: req.db.Organisation,
							include: [req.db.OrganisationType, {
								model: req.db.OrganisationUser,
								include: [req.db.User]
							}]
						}
					}
				]
			});

			const contacts = member.OrganisationMembership?.Organisation?.OrganisationUsers
				?? [member.IndividualMembership];

			return Promise.all(contacts.map(async c => {
				const msg = await req.db.Message.create({
					Sender: req.body.sender,
					Subject: req.body.subject,
					Body: replaceMessageTokens(req.body.message, c.User, member.OrganisationMembership?.Organisation)
				}, {
					transaction: t
				});

				await req.db.Recipient.create({
					Name: c.User.FullName,
					EmailAddress: c.User.Email,
					MessageId: msg.id
				}, {
					transaction: t
				});
			}));
		}));

		t.commit();

		res.redirect('./?success=true');
	} catch (ex) {
		console.log(ex);

		t.rollback();

		const [types, season] = await Promise.all([req.db.MembershipType.findAll({
			where: {
				IsActive: true
			}
		}), req.db.Season.findOne({
			where: {
				Start: {
					[Op.lte]: Date.now()
				},
				End: {
					[Op.gte]: Date.now()
				}
			}
		})]);

		if (!season) {
			return res.redirect(`/config/season?needsSeason=true&next=${req.originalUrl}`);
		}

		res.render('email/index.hbs', {
			title: 'Bulk Emailer',
			types: types,
			season: season.id,
			subject: req.body.subject,
			message: req.body.message,
			error: true
		});
	}
});

module.exports = {
	root: '/email',
	router: router
};
