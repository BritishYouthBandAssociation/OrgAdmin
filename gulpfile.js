'use strict';

const chalk = require('chalk');
const { src, dest, series } = require('gulp');
const rename = require('gulp-rename');
const fs = require('fs');
const path = require('path');
const prompt = require('prompt-sync')({ sigint: true });

// Initialise library path
const libPath = process.env.LIB_PATH ?? '../Library';

// Import library functions
const { helpers: { ConfigHelper } } = require(libPath);

function cleanConfig(done) {
	fs.readdirSync(path.join(__dirname, 'config'))
		.filter(file => !file.endsWith('.sample.json'))
		.forEach(file => fs.unlinkSync(`./config/${file}`));

	done();
}

function copyConfig() {
	return src('config/*.sample.json')
		.pipe(rename(path => {
			path.basename = path.basename.split('.sample')[0];
		}))
		.pipe(dest('config/'));
}

function setConfig(cb) {
	const writeConfig = (file, contents) => {
		console.log(chalk.green(`Writing new config to ${file}.json`));

		fs.writeFileSync(
			path.join(__dirname, 'config', `${file}.json`),
			JSON.stringify(contents)
		);
	};

	const configFiles = fs.readdirSync(path.join(__dirname, 'config'))
		.filter(file => !file.endsWith('.sample.json'))
		.map(file => file.split('.json')[0]);

	const message = '\nEditing config files\n\nWhen promped for a '
		+ `new value, press ${chalk.blue('<return>')} to keep the `
		+ 'existing one';

	console.log(chalk.green(message));

	for (const file of configFiles) {
		const contents = ConfigHelper.importJSON(path.join(__dirname, 'config'), file);

		console.log(`\nConsidering ${file}.json`);
		console.log('Current contents:');
		console.log(contents);

		const answer = prompt('Would you like to edit the config? (y/N) ');

		if (answer !== 'y') {
			continue;
		}

		for (const [ k, v ] of Object.entries(contents)) {
			let value = prompt(` - ${k} (${v}): `).trim();

			if (value.length === 0) {
				continue;
			}

			switch (typeof v) {
				case 'number':
					value = Number(value);
					break;
				case 'boolean':
					value = value === 'true';
					break;
			}

			contents[k] = value;
		}

		writeConfig(file, contents);
	}

	cb();
}

function overwriteReadme(cb) {
	const genTag = (key, tag = '-!-') => `${tag}${key}${tag}`;

	const placeholders = [
		{
			tag: 'REPONAME',
			question: 'Github repository name'
		},
		{
			tag: 'SITENAME',
			question: 'Site name'
		},
		{
			tag: 'PURPOSE',
			question: 'Site purpose (eg. A site for ...)'
		}
	];

	const readmePath = path.join(__dirname, 'README.md');
	const templatePath = path.join(__dirname, 'TEMPLATE_README.md');

	if (!fs.existsSync(readmePath) || !fs.existsSync(templatePath)) {
		return cb();
	}

	const readme = fs.readFileSync(readmePath, 'utf8');
	const template = fs.readFileSync(templatePath, 'utf8');

	// Readme already overwritten
	if (!readme.startsWith('# TemplateSite')) {
		return cb();
	}

	console.log(
		chalk.green(
			'Overwriting template README file, enter details below.'
		)
	);

	let newReadme = '';
	let happy = false;
	while (!happy) {
		newReadme = template;
		placeholders.forEach(({ tag, question }) => {
			const value = prompt(`${question}: `);
			newReadme = newReadme.replaceAll(genTag(tag), value);
		});

		console.log(chalk.green('\nReadme populated, see below\n'));
		console.log(newReadme);

		happy = prompt('Finish editing? (Y/n)? ') !== 'n';
	}

	fs.writeFileSync(readmePath, newReadme);
	console.log(chalk.green('Written new README.md'));

	cb();
}

exports.default = series(cleanConfig, copyConfig, setConfig, overwriteReadme);

exports.readme = overwriteReadme;
