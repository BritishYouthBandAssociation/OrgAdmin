'use strict';

/* global __lib */

const express = require('express');
const Joi = require('joi');

const validator = require('@byba/express-validator');

const { helpers: { StringHelper: { formatSlug } , SortHelper }} = require(__lib);

const router = express.Router();

const idParamSchema = Joi.object({
	id: Joi.string()
		.guid()
		.required()
});

const { checkAdmin, matchingID } = require('../middleware');

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
			late = late.sort((a, b) => SortHelper.dateProp('EntryDate', a, b, false));
		}

		if (config.Type.indexOf('entry') > -1) {
			regular = regular.sort((a, b) => SortHelper.dateProp('EntryDate', a, b, config.Type.split('-')[1] == 'asc'));
		} else if (config.Type == 'league') {
			regular = regular.sort((a, b) => SortHelper.compare(a.Organisation.OrganisationMemberships[0]?.LeagueScore, b.Organisation.OrganisationMemberships[0]?.LeagueScore));
		} else {
			regular = SortHelper.shuffleArray(regular);
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
	const [season, seasons] = await Promise.all([
		req.db.Season.getSeasonOrDefault(req.query.season),
		req.db.Season.getSeasons()
	]);

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
			},
			order: [
				['Start']
			]
		}),
		req.db.EventType.getActive()
	]);

	return res.render('event/index.hbs', {
		title: 'Events',
		seasons: seasons,
		season: season.id,
		events: events,
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

	const types = await req.db.EventType.getActive();

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
				req.db.EventSchedule
			]
		}),
		req.db.EventType.getActive(),
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
		await event.updateLeagueScoreForParticipants();
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

	const promises = [req.db.PaymentType.getActive()];

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
		return res.redirect(`/organisation/new?eventId=${req.params.id}&name=${req.body.organisation_search}`);
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

	]);

	const [event, , entries] = result;
	let [, divisions] = result;

	const hasUnregistered = await event.hasUnregisteredParticipants();

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

router.get('/:id/scores', async (req, res, next) => {
	const event = await req.db.Event.findByPk(req.params.id, {
		include: [{
			model: req.db.EventRegistration,
			where: {
				IsWithdrawn: false
			},
			include: [req.db.Organisation]
		}],
		order: [
			[req.db.EventRegistration, 'TotalScore']
		]
	});

	if (!event) {
		return next();
	}

	const currentRegistration = event.EventRegistrations.find(x => x.id == req.params.current);

	return res.render('event/add-scores', {
		title: `${event.Name} Scores`,
		event,
		earlyScore: event.Start > new Date(),
		currentRegistration,
		canEdit: !event.ScoresReleased
	});
});

module.exports = {
	root: '/event',
	router: router
};
