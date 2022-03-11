'use strict';

const fs = require('fs');
const path = require('path');

/**
 * importJSON() Function to safely fetch and parse a JSON file
 *
 * @param {string} filename - The filename of the json file to be loaded
 * @param {string} [dir='config'] - The directory to find the JSON file in
 *
 * @return {Object} The loaded object from the file
 */
function importJSON(filename, dir='config') {
	const fullFilename = `${filename}.json`;
	const pathToFile = path.join(__dirname, '..', dir, fullFilename);

	// Validate that a file exists with that name within the config dir
	if (!fs.existsSync(pathToFile)) {
		throw new Error(`Missing file (${pathToFile})`);
	}

	// Import the file
	let file;
	try {
		file = require(pathToFile);
	} catch {
		throw new Error(`Malformed file (${pathToFile})`);
	}

	return file;
}

module.exports = importJSON;
