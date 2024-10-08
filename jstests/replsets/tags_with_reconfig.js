// Test for SERVER-9333
// Previously, we were not clearing the cache of secondaries in the primary at reconfig
// time.  This would cause us to update stale items in the cache when secondaries
// reported their progress to a primary.

import {ReplSetTest} from "jstests/libs/replsettest.js";

// Start a replica set with 3 nodes
var host = getHostName();
var replTest = new ReplSetTest({nodes: 3});
var nodes = replTest.startSet();
var ports = replTest.ports;

// Set tags and getLastErrorModes
var conf = {
    _id: replTest.name,
    members: [
        {_id: 0, host: host + ":" + ports[0], tags: {"dc": "bbb"}},
        {_id: 1, host: host + ":" + ports[1], tags: {"dc": "bbb"}},
        {_id: 2, host: host + ":" + ports[2], tags: {"dc": "ccc"}}
    ],
    settings: {
        getLastErrorModes: {
            anydc: {dc: 1},
            alldc: {dc: 2},
        }
    }
};

replTest.initiate(conf);
replTest.awaitReplication();

var wtimeout = ReplSetTest.kDefaultTimeoutMS;
var primary = replTest.getPrimary();
var db = primary.getDB("test");

// Insert a document with write concern : anydc
assert.commandWorked(db.foo.insert({x: 1}, {writeConcern: {w: 'anydc', wtimeout: wtimeout}}));

// Insert a document with write concern : alldc
assert.commandWorked(db.foo.insert({x: 2}, {writeConcern: {w: 'alldc', wtimeout: wtimeout}}));

// Add a new tag to the replica set
var config = primary.getDB("local").system.replset.findOne();
printjson(config);
var modes = config.settings.getLastErrorModes;
config.version++;
config.members[0].tags.newtag = "newtag";

try {
    primary.getDB("admin").runCommand({replSetReconfig: config});
} catch (e) {
    print(e);
}

replTest.awaitReplication();

// Print the new config for replica set
var config = primary.getDB("local").system.replset.findOne();
printjson(config);

primary = replTest.getPrimary();
var db = primary.getDB("test");

// Insert a document with write concern : anydc
assert.commandWorked(db.foo.insert({x: 3}, {writeConcern: {w: 'anydc', wtimeout: wtimeout}}));

// Insert a document with write concern : alldc
assert.commandWorked(db.foo.insert({x: 4}, {writeConcern: {w: 'alldc', wtimeout: wtimeout}}));

replTest.stopSet();