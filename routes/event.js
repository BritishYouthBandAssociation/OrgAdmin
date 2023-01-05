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

const {checkAdmin, matchingID} = require('../middleware');

function getDiscountMultiplier(num, thresholds) {
	let multiplier = 1;

	for (let i = 0; i < thresholds.length; i++) {
		//thresholds is pre-sorted so
		if (thresholds[i].DiscountAfter > num) {
			return multiplier;
		}

		multiplier = thresholds[i].DiscountMultiplier;
	}

	return multiplier;
}

async function recalculateEntryFees(db, season, typeID, org) {
	const [type, events, discount] = await Promise.all([
		db.EventType.findByPk(typeID),
		db.Event.findAll({
			where: {
				SeasonId: season,
				EventTypeId: typeID
			},
			include: [{
				model: db.EventRegistration,
				where: {
					OrganisationId: org
				},
				include: ['RegistrationFee']
			}
			],
			order: [
				['Start', 'ASC']
			]
		}),
		db.EventTypeDiscount.findAll({
			where: {
				EventTypeId: typeID
			},
			order: [['DiscountAfter']]
		})]);

	let eligibleEvents = 0;

	for (let i = 0; i < events.length; i++) {
		const reg = events[i].EventRegistrations[0];

		if (!reg.IsWithdrawn) {
			eligibleEvents++;
		}

		const currFee = reg.RegistrationFee.Total;

		const targetMultiplier = getDiscountMultiplier(eligibleEvents, discount);
		const targetFee = type.EntryCost * targetMultiplier;

		if (currFee != targetFee) {
			reg.RegistrationFee.Total = targetFee;
			reg.RegistrationFee.save();

			//TODO: handle already paid!
		}
	}
}

function shuffleArray(array) {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}

	return array;
}

function leagueSort(entries) {
	entries.sort((a, b) => {
		const aMember = a.Organisation.OrganisationMemberships;
		const aScore = aMember.length == 0 ? 0 : aMember[0].LeagueScore;

		const bMember = b.Organisation.OrganisationMemberships;
		const bScore = bMember.length == 0 ? 0 : bMember[0].LeagueScore;

		return aScore - bScore;
	});

	return entries;
}

function entrySort(array, direction) {
	array.sort((a, b) => {
		const d1 = new Date(a.EntryDate), d2 = new Date(b.EntryDate);

		if (direction === 'asc') {
			return d1 - d2;
		}

		return d2 - d1;
	});

	return array;
}

function splitEntries(entries, cutoff) {
	const late = [], regular = [];

	entries.forEach(e => {
		if (e.EntryDate > cutoff) {
			late.push(e);
		} else {
			regular.push(e);
		}
	});

	return [late, regular];
}

async function generateSchedule(req, next, eventID, config, divisionOrder) {
	if (config.EventId) {
		delete config.EventId; //appears this interferes with other Sequelize bits...
	}

	const event = await req.db.Event.findByPk(req.params.id);

	if (!event) {
		return next();
	}

	const entries = await req.db.EventRegistration.findAll({
		include: [
			{
				model: req.db.Organisation,
				include: [{
					model: req.db.OrganisationMembership,
					include: [{
						model: req.db.Membership,
						where: {
							SeasonId: event.SeasonId
						},
						required: false
					}]
				}]
			},
			req.db.Division,
			req.db.Event
		],
		where: {
			EventId: eventID,
			IsWithdrawn: false
		}
	});

	const registrations = {};
	entries.forEach(e => {
		const div = e.DivisionId ?? -1;
		if (!registrations[div]) {
			registrations[div] = [e];
		} else {
			registrations[div].push(e);
		}
	});

	//clear data
	await Promise.all([req.db.EventSchedule.destroy({
		where: {
			EventId: eventID
		}
	}), req.db.ScheduleGeneration.destroy({
		where: {
			EventId: eventID
		}
	})]);

	const gen = await event.createScheduleGeneration(config);

	let bands = 0, minutes = 0;
	const time = new Date(event.Start), parts = config.StartTime.split(':');
	time.setHours(parts[0]);
	time.setMinutes(parseInt(parts[1]) - time.getTimezoneOffset());
	time.setSeconds(0);

	const cutoff = new Date(event.EntryCutoffDate);

	for (let i = 0; i < divisionOrder.length; i++) {
		let div = registrations[divisionOrder[i]];
		if (!div || div.length === 0) {
			//we may have withdrawn the last band for this division
			continue;
		}

		let late = [], regular = div;
		if (config.LateOnFirst) {
			[late, regular] = splitEntries(div, cutoff);
			entrySort(late, 'desc');
		}

		if (config.Type.indexOf('entry') > -1) {
			entrySort(regular, config.Type.split('-')[1]);
		} else if (config.Type == 'league') {
			leagueSort(regular);
		} else {
			shuffleArray(regular);
		}

		div = late.concat(regular);

		await gen.createScheduleDivision({
			DivisionId: divisionOrder[i] == -1 ? null : divisionOrder[i],
			Order: i
		});

		for (let j = 0; j < div.length; j++) {
			const d = div[j];
			const perfTime = d.Division?.PerformanceTime ?? 20;

			await event.createEventSchedule({
				Start: time,
				Description: d.Organisation.Name,
				Duration: perfTime
			});

			time.setMinutes(time.getMinutes() + perfTime);
			bands++;
			minutes += perfTime;

			if (config.AddBreaks && (config.BreakType === 'band' && bands >= config.BreakNum || config.BreakType === 'minute' && minutes >= config.BreakNum)) {
				await event.createEventSchedule({
					Start: time,
					Description: 'Break',
					Duration: config.BreakLength
				});

				time.setMinutes(time.getMinutes() + config.BreakLength);
				bands = 0;
				minutes = 0;
			}
		}
	}
}

router.get('/', async (req, res, next) => {
	const season = await req.db.Season.getCurrent();

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
	const season = await req.db.Season.getCurrent();

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
		SeasonId: req.body.season,
		AllowLateEntry: true
	});

	await event.setEventType(eventType);

	return res.redirect(`${event.id}/`);
});

router.get('/:id', validator.params(idParamSchema), validator.query(Joi.object({
	saved: Joi.boolean(),
	error: Joi.string()
})), async (req, res, next) => {
	const [event, types, entries] = await Promise.all([
		req.db.Event.findByPk(req.params.id, {
			include: [
				req.db.Address,
				req.db.EventType,
				req.db.EventCaption,
				req.db.EventSchedule
			]
		}),
		req.db.EventType.findAll({
			where: {
				IsActive: true
			}
		}),
		req.db.EventRegistration.count({
			where: {
				EventId: req.params.id,
				IsWithdrawn: false
			}
		})
	]);

	if (!event) {
		return next();
	}

	const missingScore = await req.db.EventRegistration.findOne({
		where: {
			EventId: event.id,
			TotalScore: null
		}
	});

	return res.render('event/view.hbs', {
		title: event.Name,
		event,
		types,
		totalCaptions: event.EventCaptions?.length ?? 0,
		judgesAssigned: event.EventCaptions?.filter(ec => ec.JudgeId != null).length ?? 0,
		organisationsRegistered: entries,
		saved: req.query.saved ?? false,
		hasSchedule: event.EventSchedules.length > 0,
		hasScores: !missingScore,
		error: req.query.error
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

	if (!event.ScoresReleased && req.body.scoresReleased) {
		//we are releasing scores here - trigger league calculation
		const [results, _] = await req.db.sequelize.query(`
			UPDATE OrganisationMemberships om
			INNER JOIN Organisations o ON o.id = om.OrganisationId
			INNER JOIN EventRegistrations er ON er.OrganisationId = o.id
			
			SET LeagueScore = (
				SELECT SUM(TotalScore) / 2
				FROM
				(
					SELECT cast(TotalScore as decimal(10, 5)) AS TotalScore
					FROM EventRegistrations
					INNER JOIN Events e ON e.id = EventRegistrations.EventId
					WHERE OrganisationId = o.id
					AND e.SeasonId = e.SeasonId
					AND IFNULL(TotalScore, -1) > 0
					AND IsWithdrawn = 0
					LIMIT 2
				) scores
			)
			
			WHERE er.EventId = :eventID
			AND er.IsWithdrawn = 0;
		`, {
			replacements: {
				eventID: event.id
			}
		});
	}

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
		.required(),
	lateEntry: Joi.boolean().required().truthy('1').falsy('0')
})), async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id);

	if (!event) {
		return next();
	}

	await event.update({
		EntryCutoffDate: req.body.registrationCutoff,
		FreeWithdrawalCutoffDate: req.body.freeWithdrawalCutoff,
		AllowLateEntry: req.body.lateEntry
	});

	return res.redirect('./?saved=true');
});

async function loadCaption(db, parent, scoresFor = null) {
	const criteria = {
		where: {
			ParentID: parent.id
		}
	};

	if (scoresFor != null) {
		criteria.include = [{
			model: db.EventRegistrationScore,
			where: {
				EventRegistrationId: scoresFor
			},
			required: false
		}];
	}

	parent.Subcaptions = await db.Caption.findAll(criteria);

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
		return loadCaption(req.db, c);
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
		.items(Joi.string().allow('')),
	judge: Joi.array()
		.items(Joi.string().uuid().allow(''))
})), async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id);

	if (!event) {
		return next();
	}

	await Promise.all(req.body.judge.map((j, index) => {
		if (j.trim().length === 0) {
			j = null;
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
		return loadCaption(req.db, c);
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
			'RegistrationFee',
			'WithdrawalFee'
		],
		order: [['IsWithdrawn', 'ASC'], ['EntryDate', 'ASC']]
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

	const now = new Date();

	registrations.forEach(r => {
		const divisionName = r.Division ? r.Division.Name : 'Unknown';

		if (!sortedRegistrations[divisionName]) { sortedRegistrations[divisionName] = []; }

		r.HasAdminAccess = req.session.user.IsAdmin || req.session.band?.id === r.Organisation.id;
		r.CanWithdraw = now < event.Start;
		r.CanReinstate = now < (event.EntryCutoffDate ?? event.Start) || event.AllowLateEntry;

		sortedRegistrations[divisionName].push(r);
	});

	res.render('event/organisations.hbs', {
		title: 'Event Registrations',
		registrations: sortedRegistrations,
		org,
		paymentTypes,
		error: req.query.error,
		success: req.query.success,
		event,
		canAddBand: req.session.band && registrations.filter(r => r.Organisation.id === req.session.band.id).length === 0
	});
});

router.post('/:id/organisations/withdraw/:orgID', async (req, res, next) => {
	const [event, org, reg] = await Promise.all([req.db.Event.findByPk(req.params.id),
		req.db.Organisation.findByPk(req.params.orgID),
		req.db.EventRegistration.findOne({
			include: ['RegistrationFee', 'WithdrawalFee', {
				model: req.db.Event,
				include: [req.db.EventType]
			}],
			where: {
				EventId: req.params.id,
				OrganisationId: req.params.orgID
			}
		})
	]);

	if (!event || !org || !reg) {
		return next();
	}

	const withdraw = !reg.IsWithdrawn;

	const today = new Date();
	if (withdraw) {
		const freeWithdrawal = new Date(event.FreeWithdrawalCutoffDate);

		if (today > freeWithdrawal && !reg.WithdrawalFeeId) {
			const fee = await req.db.Fee.create({
				Total: reg.Event.EventType.EntryCost * 1.5
			});

			reg.WithdrawalFeeId = fee.id;
		}
	} else {
		if (today > new Date(event.EntryCutoffDate)) {
			if (!event.AllowLateEntry) {
				return res.redirect('../?error=The deadline has passed for entering this event');
			}
			reg.EntryDate = today;
		}

		if (reg.WithdrawalFee && !reg.WithdrawalFee.IsPaid) {
			await req.db.Fee.destroy({
				where: {
					id: reg.WithdrawalFeeId
				}
			});

			reg.WithdrawalFeeId = null;
		}
	}

	reg.IsWithdrawn = withdraw;
	await reg.save();

	const gen = await event.getScheduleGeneration();

	if (gen && gen.Type && gen.Type !== 'manual') {
		const divs = await gen.getScheduleDivisions({
			order: [['Order', 'ASC']]
		});

		await generateSchedule(req, next, event.id, gen.dataValues, divs.map(d => d.DivisionId ?? -1));
	}

	await recalculateEntryFees(req.db, event.SeasonId, event.EventTypeId, org.id);

	return res.redirect('../');
});

router.post('/:id/organisations/add', matchingID('id', ['band', 'id']), validator.params(idParamSchema), validator.body(Joi.object({
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

	const [reg, gen] = await Promise.all([req.db.EventRegistration.create({
		...details,
		RegisteredById: req.session.user.id
	}),
	event.getScheduleGeneration()]);

	if (gen && gen.Type && gen.Type !== 'manual') {
		const divs = await gen.getScheduleDivisions({
			order: [['Order', 'ASC']]
		});

		const divId = reg.DivisionId ?? null;
		const exists = divs.filter(g => g.DivisionId == divId);

		if (!exists || exists.length === 0) {
			const newDiv = await gen.createScheduleDivision({
				DivisionId: divId,
				Order: -1
			});

			divs.push(newDiv);
		}

		await generateSchedule(req, next, event.id, gen.dataValues, divs.map(d => d.DivisionId ?? -1));
	}

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

	await req.db.EventSchedule.destroy({
		where: {
			EventId: req.params.id
		}
	});

	if (req.body.start && req.body.start.length > 0) {
		await Promise.all(req.body.start.map((_, index) =>
			event.createEventSchedule({
				Start: req.body.start[index],
				Description: req.body.name[index],
				Duration: req.body.dur[index]
			})
		));
	}

	res.redirect('?saved=true');
});

router.get('/:id/schedule/automatic', checkAdmin, async (req, res, next) => {
	const result = await Promise.all([req.db.Event.findByPk(req.params.id),
		req.db.EventRegistration.findAll({
			include: [{
				model: req.db.Division,
				attributes: ['Name', 'id']
			}],
			where: {
				EventId: req.params.id,
				IsWithdrawn: false
			},
			group: ['DivisionId']
		}),
		req.db.EventRegistration.count({
			where: {
				EventId: req.params.id,
				IsWithdrawn: false
			}
		}),
		req.db.sequelize.query(`
			SELECT 1
			FROM EventRegistrations er
			INNER JOIN Events e ON e.id = er.EventId
			WHERE er.EventID = :eventID
			AND er.IsWithdrawn = 0
			AND NOT EXISTS (
				SELECT 1
				FROM OrganisationMemberships om
				INNER JOIN Memberships m ON m.id = om.MembershipId
				WHERE om.OrganisationId = er.OrganisationId
				AND m.SeasonId = e.SeasonId
			)
		`, {
			replacements: {
				eventID: req.params.id
			}
		})
	]);

	const [event, , entries, [hasUnregistered]] = result;
	let [, divisions] = result;

	if (!event) {
		return next();
	}

	divisions = divisions.map(d => d.Division);

	return res.render('event/schedule/automatic.hbs', {
		title: `Generate Event Schedule | ${event.Name}`,
		event,
		divisions,
		entries,
		hasUnregistered,
		saved: req.query.saved ?? false
	});
});

router.post('/:id/schedule/automatic', checkAdmin, validator.body(Joi.object({
	type: Joi.string().required(),
	startTime: Joi.string().required(), //TODO: validate hh:mm format timestring
	division: Joi.array().items(Joi.number()).required(),
	breaks: Joi.number(),
	breakNum: Joi.number(),
	breakFrequency: Joi.string(),
	breakLength: Joi.number(),
	lateEntry: Joi.boolean().truthy('1').falsy('0')
})), async (req, res, next) => {
	await generateSchedule(req, next, req.params.id, {
		Type: req.body.type,
		StartTime: req.body.startTime,
		AddBreaks: req.body.breaks == 1,
		BreakNum: req.body.breakNum,
		BreakType: req.body.breakFrequency,
		BreakLength: parseInt(req.body.breakLength),
		LateOnFirst: req.body.lateEntry
	}, req.body.division);

	return res.redirect('manual?saved=true');
});

router.get('/:id/scores/:current?', async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id, {
		include: [{
			model: req.db.EventRegistration,
			where: {
				IsWithdrawn: false
			},
			include: [req.db.Organisation]
		},
		{
			model: req.db.EventCaption,
			include: [req.db.Caption, req.db.User]
		}],
		order: [
			[req.db.EventRegistration, 'TotalScore']
		]
	});

	if (!event) {
		return next();
	}

	await Promise.all(event.EventCaptions.map(ec => {
		return loadCaption(req.db, ec.Caption, req.params.current);
	}));

	const currentRegistration = event.EventRegistrations.find(x => x.id == req.params.current);

	return res.render('event/add-scores', {
		title: `${event.Name} Scores`,
		event,
		earlyScore: event.Start > new Date(),
		currentRegistration,
		canEdit: !event.ScoresReleased
	});
});

router.post('/:id/scores/:current', async (req, res, next) => {
	if (req.body.registration != req.params.current) {
		return next();
	}

	const [event, registration] = await Promise.all([req.db.Event.findByPk(req.params.id), req.db.EventRegistration.findByPk(req.body.registration)]);

	if (!event || !registration || event.ScoresReleased) {
		return next();
	}

	//clear off scores, ready to go again!
	await req.db.EventRegistrationScore.destroy({
		where: {
			EventRegistrationId: req.body.registration
		}
	});

	let totalScore = 0;
	let grandTotal = 0;
	await Promise.all(req.body.score.map((score, index) => {
		return (async function() {
			if (isNaN(score) || score.trim().length == 0) {
				return;
			}

			const caption = await req.db.Caption.findByPk(req.body.caption[index]);
			const adjustedScore = score * caption.Multiplier;
			const adjustedTotal = caption.MaxScore * caption.Multiplier;

			totalScore += adjustedScore;
			if (!caption.IsOptional) {
				grandTotal += adjustedScore;
			}

			await req.db.EventRegistrationScore.create({
				EventRegistrationId: req.body.registration,
				CaptionId: caption.id,
				RawScore: score,
				RawMax: caption.MaxScore,
				AdjustedScore: adjustedScore,
				AdjustedMax: adjustedTotal,
				AdjustmentMultiplier: caption.Multiplier
			});
		})();
	}));

	registration.TotalScore = grandTotal / 10.0;
	await registration.save();

	return res.redirect('?saved=true');
});

module.exports = {
	root: '/event',
	router: router
};
