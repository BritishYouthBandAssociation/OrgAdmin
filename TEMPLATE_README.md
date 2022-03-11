# -!-REPONAME-!-
> -!-PURPOSE-!-

## Table of Contents
- [General Info](#general-information)
- [Technologies Used](#technologies-used)
- [Structure](#structure)
- [Setup](#setup)

## General Information
This repository contains the code for the -!-SITENAME-!- website.

## Technologies Used
- JavaScript
- Node.JS
- Handlebars
- ExpressJS
- ESLint

## Structure
```
/
+-- .husky		- contains custom git hooks
+-- config		- contains sample configuration files
+-- lib			- contains general helper modules and classes
+-- public		- contains static content served directly
+-- routes		- contains Express routers
+-- views		- contains handlebars view files
|   +-- layouts		- contains handlebars layout files
|   +-- partials	- contains handlebars partials
+-- app.js		- the entry point for the application
```

## Setup
### Prerequisites
- Node.JS
- NPM
- gulp-cli (to install this run `npm install -g gulp-cli` as a priviledged user)

### Instructions
1. Clone this new repository to your development environment
2. Using a command line, run `npm install` - this will install all of the dependencies for the site and the custom git hooks
4. Using a command line, run `gulp`. This will:
   - Copy all sample configurations to their non-sample counterpart
   - Prompt you to edit the config values to suit your environment
