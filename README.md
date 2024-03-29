# OrgAdmin
> A site for organisations (e.g. BYBA) to carry out administrative tasks (such as configuring events)

## Table of Contents
- [General Info](#general-information)
- [Technologies Used](#technologies-used)
- [Structure](#structure)
- [Setup](#setup)

## General Information
This repository contains the code for the Organisation Admin website.

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
- Yarn
- gulp-cli (to install this run `yarn global add gulp-cli` as a privileged user)

### Instructions
1. Clone this new repository to your development environment
2. Using a command line, run `yarn` - this will install all of the dependencies for the site and the custom git hooks
4. Using a command line, run `gulp`. This will:
   - Copy all sample configurations to their non-sample counterpart
   - Prompt you to edit the config values to suit your environment
