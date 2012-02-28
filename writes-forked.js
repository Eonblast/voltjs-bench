function getRand(max) {
    return Math.floor(Math.random() * max);
}
/* This file is part of VoltDB.
 * Copyright (C) 2008-2012 VoltDB Inc.
 *
 * This file contains original code and/or modifications of original code.
 * Any modifications made by VoltDB Inc. are licensed under the following
 * terms and conditions:
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
 * OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
 * ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */

/* 
 * Authors:
 * Andy Wilson <awilson@voltdb.com> [www.voltdb.com]
 * Henning Diedrich <hd2010@eonblast.com> [www.eonblast.com]
 * 
 */

var voltjs = "./voltdb-client-nodejs/";

var os = require('os')
var cli = require('cli');
var util = require('util');
var cluster = require ('cluster');

var VoltClient = require(voltjs + 'lib/client');
var VoltProcedure = require(voltjs + 'lib/query');
var VoltQuery = require(voltjs + 'lib/query');

var numCPUs = os.cpus().length
var logTag = "master  "

var client = null;
var resultsProc = new VoltProcedure('Results');
var initProc = new VoltProcedure('Initialize', ['int', 'string']);
var writeProc = new VoltProcedure('Insert', ['string','string','string']);
var throughput = 0;

var options = cli.parse({
    loops     : ['c', 'Number of loops to run', 'number', 10000],
    voltGate  : ['h', 'VoltDB host (any if multi-node)', 'string', 'localhost'],
    workers   : ['f', 'client worker forks', 'number', numCPUs],
    verbose   : ['v', 'verbose output'],
    debug     : ['d', 'debug output']
});

var workers = options.workers;
var vlog = options.verbose || options.debug ? log : function() {}
var vvlog = options.debug ? log : function() {}

var cargos = 'a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z';
var lcargos = cargos.length

if (cluster.isMaster)
    master_main();
else
    worker_main();

function master_main() {

  log("-- Forking Write Benchmark Client --")

  log("VoltDB host:  " + options.voltGate);
  log("worker forks: " + workers);

  // fork workers
  for (var i = 0; i < workers; i++) {
    vvlog('forking worker #' + i)
    var worker = cluster.fork()
    
    // result counter
    worker.on('message', function(msg) {
      if (msg.cmd && msg.cmd == 'result') {
        throughput +=  msg.throughput
      }
    });
  }

  // nearing end, track exits, print total
  var exited = 0;  
  cluster.on('death', function(worker) {
    vlog('worker (pid ' + worker.pid + ') exits.')
    exited++;
    if(exited == workers) {
        var total = Math.round(throughput);
        var percore = Math.round(total / numCPUs);
        var perwrk = Math.round(total / workers);
        log("Total: " + dec(total) + " TPS"
              + " = " + dec(percore) + " TPS/core "
              + " = " + dec(perwrk) + " TPS/fork")
    }
  })
}


function worker_main() {

    logTag = 'worker ' + process.env.NODE_WORKER_ID
    vvlog('worker main')

    // define and start a Volt client
    client = new VoltClient([{
        host: options.voltGate,
        port: 21212,
        username: 'user',
        password: 'password',
        service: 'database',
        queryTimeout: 50000
    
    }]);
    client.connect(function startup(results) {
            vvlog('Node up');
            voltInit();
        },
        function loginError(results) {
            log('Node up (on Error)');
            voltInit();
    });
    vvlog('connected')
}

function voltInit() {
    vvlog('voltInit');
    var job = {
        loops: options.loops,
        steps: getSteps() 
    };
    step(job);
}

function getSteps() {
    var steps = [];
    steps.push(writeInsertLoop);
    steps.push(writeEnd);
    return steps;
}

function connectionStats() {
    client.connectionStats();
}

function writeEnd(job) {
    ////  client.connectionStats();
    vvlog('writeEnd');
    process.exit();
}

function writeInsertLoop(job) {

    var index = 0;
    var reads = job.loops;
    var startTime = new Date().getTime();
    var chunkTime = new Date().getTime();
    var doneWith = 0;

    var innerLoop = function() {
        var query = writeProc.getQuery();
        if(index < job.loops) {
            query.setParameters([getRandString(1,20),
                                getRandString(1,20),
                                getRandString(1,20)]);

            /////// the actual write ////////////////////////////
            /////////////////////////////////////////////////////
            client.call(query, function displayResults(results) {
                vvlog("reads ", reads);
                reads--;
                if(reads == 0) {
                    logTime(startTime, job.loops, "Results");
                    step(job);
                } else {
                   vvlog("reads ", reads);
                }
            }, function readyToWrite() {
                
                if(index < job.loops) {
                    if ( index && index % 5000 == 0 ) {
                        vlog('Executed ' + index + ' writes in ' + 
                        ((new Date().getTime()) - chunkTime) + 'ms ' +
                        util.inspect(process.memoryUsage()));
                        chunkTime = new Date().getTime();
                    }

                    index++;
                    process.nextTick(innerLoop);
                } else {
                    log(doneWith++, 'Time to stop voting: ',
                         index);
                }
            });
        } else {
            vvlog('Index is: ' + index + ' and ' + job.loops);
        }
    };

    // void stack, yield
    process.nextTick(innerLoop);

}

function logTime(startTime, writes, typeString) {

  var endTimeMS = Math.max(1,new Date().getTime() - startTime);
  var throughput = writes * 1000 / endTimeMS;

   log(util.format(
        '%s transactions in %s milliseconds --> ' +
        '%s TPS',
        dec(writes),
        dec(endTimeMS), 
        dec(throughput)));

    process.send({ cmd: 'result', throughput: throughput });
}

function step(job) {

    if(job.steps.length > 0) {
        var method = job.steps.shift();
        method(job);
    }
}

function log(tx) {
    tx = tx.replace(/\n/g, "\n" + logTag + ": ");
    console.log(logTag + ": " + tx);
}

function getRand(ceil) {
    return Math.floor(Math.random() * ceil);
}

function getRandString(lmin,lmax) {
    var l = lmin + getRand(lmax-lmin)
    var s = ""
    for(var i=0;i<l;i++)
        s = s + cargos[getRand(lcargos)];
    return s
}

function dec(n) {
    n = Math.floor(n).toString()
    n = n.replace(/(\d)(\d\d\d)($|[,.])/, "$1,$2$3");
    return n
}