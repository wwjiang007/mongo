/**
 * Test that getShardVersion with the optional fullMetadata option enabled returns the correct
 * version and chunks when run against a mongos.
 */
import {ShardingTest} from "jstests/libs/shardingtest.js";

// If the server has been compiled with the code coverage flag, then the splitChunk command can take
// significantly longer than the 8-second interval for the continuous stepdown thread. This causes
// the test to fail because retrying the interrupted splitChunk command won't ever succeed. To check
// whether the server has been compiled with the code coverage flag, we assume the compiler flags
// used to build the mongo shell are the same as the ones used to build the server.

const st = new ShardingTest({shards: 2});
const buildInfo = assert.commandWorked(st.s.adminCommand({"buildInfo": 1}));
const isCodeCoverageEnabled = buildInfo.buildEnvironment.ccflags.includes('-ftest-coverage');
const isStepdownSuite = TestData.runningWithConfigStepdowns;
if (isStepdownSuite && isCodeCoverageEnabled) {
    st.stop();
    print('Skipping test during stepdown suite because splitChunk command would take too long');
    quit();
}

// Disable the check (the size of the chunk boundaries generated by this test causes the aggregation
// query collecting the routing table metadata to fail due to max document size exceeded).
TestData.skipCheckRoutingTableConsistency = true;

const dbName = "test";
const collName = "foo";
const ns = dbName + "." + collName;
const primaryShard = st.shard0;
const otherShard = st.shard1;
const min = {
    x: MinKey,
    y: MinKey
};
const max = {
    x: MaxKey,
    y: MaxKey
};

assert.commandWorked(
    st.s.adminCommand({enablesharding: dbName, primaryShard: primaryShard.shardName}));
assert.commandWorked(st.s.adminCommand({shardCollection: ns, key: {x: 1, y: 1}}));

// Check shard version.
let res = st.s.adminCommand({getShardVersion: ns});
assert.commandWorked(res);
assert.eq(res.version.t, 1);
assert.eq(res.version.i, 0);
assert.eq(undefined, res.chunks);

// When fullMetadata set to true, chunks should be included in the response
res = st.s.adminCommand({getShardVersion: ns, fullMetadata: true});
assert.commandWorked(res);
assert.eq(res.version.t, 1);
assert.eq(res.version.i, 0);
assert.eq(1, res.chunks.length);
assert.eq(min, res.chunks[0][0]);
assert.eq(max, res.chunks[0][1]);

// Split the existing chunks to create a large number of chunks (> 16MB).
// This needs to be done twice since the BSONObj size limit also applies
// to command objects for commands like splitChunk.
const bigString = 'X'.repeat(1024 * 1024);  // 1MB

// Run splitChunk on the shards directly since the split command for mongos doesn't have an option
// to specify multiple split points or number of splits.
let splitPoints = [];
for (let i = 0; i < 7; i++) {
    splitPoints.push({x: i, y: bigString});
}
assert.commandWorked(st.rs0.getPrimary().getDB('admin').runCommand({
    splitChunk: ns,
    from: st.shard0.shardName,
    min: min,
    max: max,
    keyPattern: {x: 1},
    splitKeys: splitPoints,
    epoch: res.versionEpoch,
}));

let prevMin = splitPoints[splitPoints.length - 1];
splitPoints = [];
for (let i = 7; i < 14; i++) {
    splitPoints.push({x: i, y: bigString});
}
assert.commandWorked(st.rs0.getPrimary().getDB('admin').runCommand({
    splitChunk: ns,
    from: st.shard0.shardName,
    min: prevMin,
    max: max,
    keyPattern: {x: 1},
    splitKeys: splitPoints,
    epoch: res.versionEpoch,
}));

// Ensure all the config nodes agree on a config optime that reflects the second split in case a new
// primary config server steps up.
st.configRS.awaitLastOpCommitted();

// Perform a read on the config primary to have the mongos get the latest config optime since the
// last two splits were performed directly on the shards.
assert.neq(null, st.s.getDB('config').databases.findOne());

// Trigger a refresh on the mongos through a moveChunk command.
assert.commandWorked(
    st.s.adminCommand({moveChunk: ns, find: {x: 0, y: bigString}, to: otherShard.shardName}));

// Chunks should not be included in the response because the chunk size exceeds the limit.
res = st.s.adminCommand({getShardVersion: ns, fullMetadata: true});
assert.commandWorked(res);
assert.eq(undefined, res.chunks);

st.stop();
