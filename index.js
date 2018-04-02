#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

const minimist = require('minimist');
const _ = require('lodash');

const IGNORE_REGEX = /(^\.)|(node_modules)/;

// Get args
let argv = minimist(process.argv.slice(2));

// Get dir to process, defaulting to _
const dir = _.first(argv._) || '.';

// Check that it exists and is a directory.
if (!fs.existsSync(dir)) {
    console.log(`Sorry, "${dir}" does not exist.`);
}
if (!(fs.statSync(dir).mode & fs.constants.S_IFDIR)) {
    console.log(`Sorry, "${dir}" is not a directory.`);
}

// Start a-crawlin'
(function crawl(curdir, breadcrumbs) {
    console.log(`CRAWLING ${curdir}`);
    breadcrumbs = _.clone(breadcrumbs) || [];
    // Find all of the files and directories underneath the current one.
    let filesAndDirectories = fs.readdirSync(curdir);
    // Ignore dotfiles.
    filesAndDirectories = _.filter(filesAndDirectories, filename => !filename.match(IGNORE_REGEX));
    // Split it into files and directories.
    filesAndDirectories = _.reduce(
        filesAndDirectories,
        (memo, filename) => {
            const stat = fs.statSync(path.resolve(curdir, filename));
            if (stat.mode & fs.constants.S_IFDIR) {
                memo.directories.push(filename);
            } else {
                if (path.extname(filename) === '.md') {
                    memo.files.push(filename);
                }
            }
            return memo;
        },
        { files: [], directories: [] }
    );

    // Push this directory in to the breadcrumbs.
    breadcrumbs.push(path.basename(curdir));

    // Process all files in this directory.
    _.each(filesAndDirectories.files, filename =>
        processFile(filename, curdir, breadcrumbs, filesAndDirectories)
    );

    // Process all subdirectories.
    _.each(filesAndDirectories.directories, dirname => crawl(path.resolve(curdir, dirname), breadcrumbs));
})(dir);

function processFile(filename, dir, breadcrumbs, filesAndDirectories) {
    console.log('PROCESSING', filename);

    const isReadme = filename.toLowerCase() === 'readme.md';
    let breadcrumbMarkdown;
    if (breadcrumbs.length > 2) {
        breadcrumbMarkdown = `<!-- BEGIN TOCME BREADCRUMB -->
>`;
        breadcrumbMarkdown += _.map(
            breadcrumbs,
            (breadcrumb, i) =>
                `[${breadcrumb.replace(/-/g, ' ')}](` + _.repeat('../', breadcrumbs.length - i) + ')'
        ).join(' - ');
        breadcrumbMarkdown += `
<!-- END TOCME BREADCRUMB -->
`;
    }

    let tocMarkdown = '<!-- BEGIN TOCME TOC -->\n';
    tocMarkdown += _.map(breadcrumbs, (breadcrumb, i) => {
        let str = '> ' + _.repeat('  ', i) + '* ';
        if (i === breadcrumbs.length - 1 && isReadme) {
            str += `**${_.capitalize(breadcrumb.replace(/-/, ' '))}** &lt;-- you are here`;
        } else {
            str +=
                `[${_.capitalize(breadcrumb.replace(/-/, ' '))}](./` +
                _.repeat('../', breadcrumbs.length - (i + 1)) +
                'README.md)';
        }
        return str;
    }).join('\n');
    tocMarkdown += '\n';
    tocMarkdown += _.compact(
        _.map(filesAndDirectories.files, fileInDirectory => {
            if (fileInDirectory.toLowerCase() === 'readme.md') {
                return null;
            }
            let str = '> ' + _.repeat('  ', breadcrumbs.length) + '* ';
            if (fileInDirectory === filename) {
                str += `**${_.capitalize(
                    fileInDirectory.replace(/-/g, ' ').replace(/\.md/, '')
                )}** &lt;-- you are here`;
            } else {
                str += `[${_.capitalize(
                    fileInDirectory.replace(/-/g, ' ').replace(/\.md/, '')
                )}](${fileInDirectory})`;
            }
            return str;
        })
    ).join('\n');
    tocMarkdown += '\n';
    tocMarkdown += _.map(filesAndDirectories.directories, subdirectory => {
        let str = '> ' + _.repeat('  ', breadcrumbs.length) + '* ';
        str += `[**${_.capitalize(subdirectory.replace(/-/, ' '))}**](./${subdirectory}/README.md)`;
        return str;
    }).join('\n');
    tocMarkdown += '\n\n';
    tocMarkdown += '<!-- END TOCME TOC -->';

    // Load up the file
    let theFile = fs.readFileSync(path.resolve(dir, filename)).toString();

    // Remove any existing TOC
    theFile = theFile.replace(
        /\<\!\-\- BEGIN TOCME TOC \-\-\>[\w\W]*?\<\!\-\- END TOCME TOC \-\-\>\n?\n?/g,
        ''
    );

    // Add TOC after the first heading
    theFile = theFile.replace(/^\#(.*)/, '#$1\n' + tocMarkdown + '\n');

    // Write the file out
    fs.writeFileSync(path.resolve(dir, filename), theFile);

    return;
}
