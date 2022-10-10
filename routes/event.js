'use strict';

/* global __lib */

const express = require('express');
const Joi = require('joi');
const { Op } = require('sequelize');

const validator = require('@byba/express-validator');

const { helpers: { SlugHelper: { formatSlug } } } = require(__lib);

const router = express.Router();

const idParamSchema = Joi.object({
	id: Joi.string()
		.guid()
		.required()
});

router.get('/', async (req, res, next) => {
	const season = await req.db.Season.findOne({
		where: {
			Start: {
				[Op.lte]: Date.now()
			},
			End: {
				[Op.gte]: Date.now()
			}
		}
	});

	if (!season) {
		return res.redirect(`/config/season?needsSeason=true&next=${req.originalUrl}`);
	}

	const [events, eventTypes] = await Promise.all([
		req.db.Event.findAll({
			include: [
				req.db.EventType
			],
			where: {
				SeasonId: season.id
			}
		}),
		req.db.EventType.findAll()
	]);

	return res.render('event/index.hbs', {
		title: 'Events',
		years: [season.id],
		year: season.id,
		events,
		filters: eventTypes
	});
});

router.get('/new', validator.query(Joi.object({
	error: Joi.boolean()
})), async (req, res, next) => {
	const season = await req.db.Season.findOne({
		where: {
			Start: {
				[Op.lte]: Date.now()
			},
			End: {
				[Op.gte]: Date.now()
			}
		}
	});

	if (!season) {
		return res.redirect(`/config/season?needsSeason=true&next=${req.originalUrl}`);
	}

	const types = await req.db.EventType.findAll({
		where: {
			IsActive: true
		}
	});

	return res.render('event/add.hbs', {
		title: 'Add New Event',
		types,
		season,
		error: req.query.error
	});
});

router.post('/new', validator.body(Joi.object({
	name: Joi.string()
		.required(),
	type: Joi.number()
		.required(),
	start: Joi.date()
		.required(),
	end: Joi.date()
		.required(),
	season: Joi.number()
		.required()
})), async (req, res, next) => {
	if (req.body.end < req.body.start) {
		return res.redirect('./new/?error=true');
	}

	const eventType = await req.db.EventType.findOne({
		where: {
			id: req.body.type
		}
	});

	if (!eventType) {
		console.log('Invalid fields!');
		return res.redirect('./new/?error=true');
	}

	const slug = formatSlug(`${req.body.start.getFullYear()}-${req.body.name}`);

	const event = await req.db.Event.create({
		Name: req.body.name,
		Start: req.body.start,
		End: req.body.end,
		Slug: slug,
		SeasonId: req.body.season
	});

	await event.setEventType(eventType);

	return res.redirect(`${event.id}/`);
});

router.get('/:id', validator.params(idParamSchema), validator.query(Joi.object({
	saved: Joi.boolean()
})), async (req, res, next) => {
	const [event, types] = await Promise.all([
		req.db.Event.findByPk(req.params.id, {
			include: [
				req.db.Address,
				req.db.EventType,
				req.db.EventCaption,
				req.db.Organisation,
				req.db.EventSchedule
			]
		}),
		req.db.EventType.findAll({
			where: {
				IsActive: true
			}
		})
	]);

	if (!event) {
		return next();
	}

	return res.render('event/view.hbs', {
		title: event.Name,
		event,
		types,
		totalCaptions: event.EventCaptions?.length ?? 0,
		judgesAssigned: event.EventCaptions?.filter(ec => ec.JudgeId != null).length ?? 0,
		organisationsRegistered: event.Organisations?.length ?? 0,
		saved: req.query.saved ?? false,
		hasSchedule: event.EventSchedules.length > 0
	});
});

router.post('/:id', validator.params(idParamSchema), validator.body(Joi.object({
	name: Joi.string()
		.required(),
	type: Joi.number()
		.required(),
	start: Joi.date()
		.required(),
	end: Joi.date()
		.required(),
	slug: Joi.string()
		.required(),
	membersOnly: Joi.boolean()
		.truthy('1')
		.falsy('0')
		.required(),
	scoresReleased: Joi.boolean()
		.truthy('1')
		.falsy('0')
		.required(),
	lineOne: Joi.string()
		.empty(''),
	lineTwo: Joi.string()
		.empty(''),
	city: Joi.string()
		.empty(''),
	postcode: Joi.string()
		.empty(''),
	description: Joi.string()
		.empty(''),
})), async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id, {
		include: [req.db.Address]
	});

	if (!event) {
		return next();
	}

	const addressProvided = req.body.lineOne && req.body.lineTwo && req.body.city && req.body.postcode;

	await event.update({
		Name: req.body.name,
		Type: req.body.type,
		Start: req.body.start,
		End: req.body.end,
		Slug: formatSlug(req.body.slug),
		Description: req.body.description,
		MembersOnly: req.body.membersOnly,
		ScoresReleased: req.body.scoresReleased
	});

	if (addressProvided) {
		const values = {
			Line1: req.body.lineOne,
			Line2: req.body.lineTwo,
			City: req.body.city,
			Postcode: req.body.postcode,
		};

		if (event.Address) {
			await event.Address.update(values);
		} else {
			const address = await req.db.Address.create(values);
			await event.setAddress(address);
		}
	}

	return res.redirect('./?saved=true');
});

router.post('/:id/registration', validator.params(idParamSchema), validator.body(Joi.object({
	registrationCutoff: Joi.date()
		.required(),
	freeWithdrawalCutoff: Joi.date()
		.required()
})), async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id);

	if (!event) {
		return next();
	}

	await event.update({
		EntryCutoffDate: req.body.registrationCutoff,
		FreeWithdrawalCutoffDate: req.body.freeWithdrawalCutoff,
	});

	return res.redirect('./?saved=true');
});

async function loadCaption(db, parent) {
	parent.Subcaptions = await db.findAll({
		where: {
			ParentID: parent.id
		}
	});

	await Promise.all(parent.Subcaptions.map(s => {
		return loadCaption(db, s);
	}));

	return parent;
}

function filterCaptions(arr, caption) {
	if (caption.Subcaptions.length > 0 && caption.Subcaptions[0].Subcaptions.length === 0) {
		//we have found our weird mid-level!
		arr.push(caption);
		return arr;
	}

	caption.Subcaptions.forEach(c => {
		arr = filterCaptions(arr, c);
	});

	return arr;
}

router.get('/:id/judges', validator.params(idParamSchema), validator.query(Joi.object({
	add: Joi.number(),
	success: Joi.boolean()
})), async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id, {
		include: [{
			model: req.db.EventCaption,
			include: [req.db.Caption, req.db.User]
		}]
	});

	if (!event) {
		return next();
	}

	if (req.query.add && !event.EventCaptions.some(c => c.CaptionId === req.query.add)) {
		req.db.EventCaption.create({
			EventId: req.params.id,
			CaptionId: req.query.add
		});

		return res.redirect('?success=true');
	}

	//load top level
	const captionData = await req.db.Caption.findAll({
		where: {
			ParentID: null
		}
	});

	const noCaptions = captionData.length === 0;

	//load the rest
	await Promise.all(captionData.map(c => {
		return loadCaption(req.db.Caption, c);
	}));

	let captions = [];
	captionData.forEach(c => filterCaptions(captions, c));
	captions = captions.filter(c => !event.EventCaptions.some(cap => cap.CaptionId === c.id));

	res.render('event/judges.hbs', {
		title: `Judges for ${event.Name}`,
		event: event,
		captions: captions,
		success: req.query.success ?? false,
		noCaptions
	});
});

router.post('/:id/judges', validator.params(idParamSchema), validator.body(Joi.object({
	caption: Joi.array()
		.items(Joi.number()),
	// eslint-disable-next-line camelcase
	judge_search: Joi.array()
		.items(Joi.string()),
	judge: Joi.array()
		.items(Joi.string().uuid())
})), async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id);

	if (!event) {
		return next();
	}

	await Promise.all(req.body.judge.map((j, index) => {
		if (j.trim().length === 0) {
			return null;
		}

		return req.db.EventCaption.update({
			JudgeId: j
		}, {
			where: {
				id: req.body.caption[index]
			}
		});
	}));

	res.redirect('?success=true');
});

router.post('/:id/judges/remove', validator.params(idParamSchema), validator.body(Joi.object({
	caption: Joi.number()
		.required()
})), async (req, res, next) => {
	const [event, caption] = await Promise.all([
		req.db.Event.findByPk(req.params.id),
		req.db.Caption.findByPk(req.body.caption)
	]);

	if (!event || !caption) {
		return next();
	}

	await req.db.EventCaption.destroy({
		where: {
			EventId: event.id,
			CaptionId: caption.id
		}
	});

	res.redirect('./?success=true');
});

router.post('/:id/judges/reset', validator.params(idParamSchema), async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id);
	if (!event) {
		return next();
	}

	//load top level
	const captionData = await req.db.Caption.findAll({
		where: {
			ParentID: null
		}
	});

	//load the rest
	await Promise.all(captionData.map(c => {
		return loadCaption(req.db.Caption, c);
	}));

	const captions = [];
	captionData.forEach(c => filterCaptions(captions, c));

	await req.db.EventCaption.destroy({
		where: {
			EventId: req.params.id
		}
	});

	Promise.all(captions.map(c => {
		return req.db.EventCaption.create({
			EventId: req.params.id,
			CaptionId: c.id
		});
	}));

	res.redirect('./?success=true');
});

router.get('/:id/organisations', validator.params(idParamSchema), validator.query(Joi.object({
	error: [Joi.boolean(), Joi.string()],
	success: Joi.boolean(),
	org: Joi.number()
		.integer()
})), async (req, res, next) => {
	const [registrations, event] = await Promise.all([req.db.EventRegistration.findAll({
		include: [
			{
				model: req.db.Event,
				where: {
					id: req.params.id
				}
			},
			req.db.Organisation,
			req.db.User,
			req.db.Division,
			req.db.Fee
		],
	}), req.db.Event.findByPk(req.params.id)]);

	if (!event) {
		return next();
	}

	const promises = [];

	promises.push(req.db.PaymentType.findAll({
		where: {
			IsActive: true
		}
	}));

	if (req.query.org) {
		promises.push(req.db.Organisation.findByPk(req.query.org));
	}

	const [paymentTypes, org] = await Promise.all(promises);

	if (typeof req.query.error === 'string') {
		req.query.error = decodeURIComponent(req.query.error);
	} else if (typeof req.query.error === 'boolean') {
		req.query.error = 'An error has occurred while saving, please check the details and try again';
	}

	const sortedRegistrations = {};

	registrations.forEach(r => {
		const divisionName = r.Division ? r.Division.Name : 'Unknown';

		if (!sortedRegistrations[divisionName]) { sortedRegistrations[divisionName] = []; }

		r.HasAdminAccess = req.session.user.IsAdmin || req.session.band?.id === r.Organisation.id;

		sortedRegistrations[divisionName].push(r);
	});

	res.render('event/organisations.hbs', {
		title: 'Event Registrations',
		registrations: sortedRegistrations,
		org,
		paymentTypes,
		error: req.query.error,
		success: req.query.success,
		event
	});
});

router.post('/:id/organisations/add', validator.params(idParamSchema), validator.body(Joi.object({
	// eslint-disable-next-line camelcase
	organisation_search: Joi.string()
		.allow('')
		.required(),
	organisation: Joi.number()
		.integer()
		.allow('')
		.required(),
	notFound: Joi.boolean()
})), async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id);

	if (!event) {
		return next();
	}

	if (req.body.notFound) {
		return res.redirect(`/organisation/new?eventId=${req.params.id}`);
	}

	const org = await req.db.Organisation.findByPk(req.body.organisation);

	if (!org) {
		return next();
	}

	if (req.session.band && req.session.band.id !== org.id) {
		return res.redirect('/no-access');
	}

	const details = {
		OrganisationId: org.id,
		EventId: event.id
	};

	const exists = (await req.db.EventRegistration.findAndCountAll({
		where: details
	})).count > 0;

	if (exists) {
		const errorMessage = `${org.Name} is already registered`;
		return res.redirect(`./?error=${encodeURIComponent(errorMessage)}`);
	}

	if (event.MembersOnly && !await org.hasCurrentMembership()) {
		const errorMessage = `${event.Name} is a members only event, and ${org.Name} does not have a current membership, or the current membership has not yet been paid for`;
		return res.redirect(`./?error=${encodeURIComponent(errorMessage)}`);
	}

	await req.db.EventRegistration.create({
		...details,
		RegisteredById: req.session.user.id
	});

	res.redirect('./?success=true');
});

router.get('/:id/schedule', async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id);
	if (!event) {
		return next();
	}

	//temp
	return res.redirect('manual');
});

router.get('/:id/schedule/manual', async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id, {
		include: [req.db.EventSchedule]
	});
	if (!event) {
		return next();
	}

	return res.render('event/schedule/manual.hbs', {
		title: `Create Event Schedule | ${event.Name}`,
		event,
		saved: req.query.saved ?? false
	});
});

router.post('/:id/schedule/manual', async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id);
	if (!event) {
		return next();
	}

	await event.setEventSchedules([]);

	if (req.body.start && req.body.start.length > 0) {
		for (let i = 0; i < req.body.start.length; i++) {
			await event.createEventSchedule({
				Start: req.body.start[i],
				Description: req.body.name[i],
				Duration: req.body.dur[i]
			});
		}
	}

	res.redirect('?saved=true');
});

module.exports = {
	root: '/event',
	router: router
};
