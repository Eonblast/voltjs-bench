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
 * Use: e.g. node bench.js -h localhost -c 5000000 -l 5000  -f 2 -x -i "#1" -q
 *
 */

var voltjs = "./voltdb-client-nodejs/";

var os = require('os')
var cli = require('cli');
var util = require('util');
var cluster = require ('cluster');

var VoltClient = require(voltjs + 'lib/client');
var VoltConfiguration = require(voltjs + 'lib/configuration');
var VoltProcedure = require(voltjs + 'lib/query');
var VoltQuery = require(voltjs + 'lib/query');

var numCPUs = os.cpus().length
var logTag = "master  "
var worker_id = "x"
var ordnum = 0

// init the stored procedure definitions
var writeProc = new VoltProcedure('Insert', ['string','string','string']);
var readProc = new VoltProcedure('Select', ['string']);
var resultsProc = new VoltProcedure('Results');
var initProc = new VoltProcedure('Initialize', ['int', 'string']);
var voteProc = new VoltProcedure('Vote', ['long', 'int', 'long']);

var client = null;

var throughput = 0;
var transactionCounter = 0; /// new
var statsLoggingInterval = 10000; /// new


var options = cli.parse({
    loops     : ['c', 'Number of loops to run', 'number', 10000],
    voltGate  : ['h', 'VoltDB host (any if multi-node)', 'string', 'localhost'],
    workers   : ['f', 'client worker forks', 'number', numCPUs],
    verbose   : ['v', 'verbose output'],
    write     : ['w', 'write'],
    read      : ['r', 'read'],
    vote      : ['x', 'vote (1 write + 3 reads)'],
    numeric   : ['n', 'numeric, sequential dummy data'],
    debug     : ['d', 'debug output'],
    quiet     : ['q', 'quieter output'],
    lograte   : ['l', 'TPS log frequency', 'number', 10000],
    logaverage: ['a', 'TPS over last n acticity', 'number', 1000000],
    id        : ['i', 'machine id for logging', 'string', '']
});

var workers = options.workers;
var running = 0;
var qlog = _log
var log = !options.quiet||options.verbose||options.debug ? _log : function() {}
var vlog = options.verbose || options.debug ? _log : function() {}
var vvlog = options.debug ? _log : function() {}

var cargos = 'abcdefghijklmnopqrstuvwxyz';
var lcargos = cargos.length

if (cluster.isMaster)
    master_main();
else
    worker_main();

function master_main() {

  logTag = (options.id?options.id+" ":"") + 'master '
  worker_id = "0"

  log("VoltDB Benchmark Client")

  log("VoltDB host:  " + options.voltGate);
  log("access: " + (options.write?"writes ":"") + (options.reads?"reads ":"") + (options.vote?"vote ":""));
  if(options.write || options.reads) log("values: " + (options.numeric?"numeric sequences":"random strings"));
  log("worker forks: " + workers);

  if(options.vote)
      voltVoteInit();

  // fork workers
  var logaverages = Array(workers); logaverages[0] = 0;
  var logavetimes = Array(workers); logavetimes[0] = 0;
  var logrates = Array(workers); logrates[0] = 0;
  for (var i = 0; i < workers; i++) {
    vvlog('forking worker #' + i)
    var worker = cluster.fork()
    
    // result counter
    worker.on('message', function(msg) {
      if (msg.cmd && msg.cmd == 'result') {
        throughput +=  msg.throughput;
      }
      if (msg.cmd && msg.cmd == 'lap') {
        var ai = parseInt(msg.worker);
        logrates[ai] = msg.rate;
        logaverages[ai] = msg.average;
        logavetimes[ai] = msg.average_range;
        vvlog("got average from " + msg.worker + ": " + logaverages[ai]);
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
        qlog("Total: " + dec(total) + " TPS"
              + " = " + dec(percore) + " TPS/core "
              + " = " + dec(perwrk) + " TPS/fork")
    }
  })
  
  var last_master_rate = 0;
  var last_master_roll_rate = 0;
  setInterval(function() {
    var rate = logrates.sum();
    var roll_rate = logaverages.sum();
    var roll_range = Math.round((logavetimes.length ? logavetimes.sum() / logavetimes.length : 0) / 6000) / 10;
    var cores = numCPUs;
    var forks = workers - exited;
    var core_rate = Math.round(roll_rate / cores);
    var worker_rate = Math.round(roll_rate / forks);
    var master_diff = 
        rcutpad(pad("", Math.log(Math.abs(rate - last_master_rate)) / 2.302585092994046, 
        (rate > last_master_rate ? "+" : "-")),8," ");
    var master_roll_diff = 
        rcutpad(pad("", Math.log(Math.abs(roll_rate - last_master_roll_rate)) / 2.302585092994046, 
        (roll_rate > last_master_roll_rate ? "+" : "-")),8," ");
    last_master_rate = rate; // not var
    last_master_roll_rate = roll_rate; // not var
    if(rate) 
        qlog( dec(rate) + " TPS " + master_diff + " " + roll_range +  "m avg: " +  dec(roll_rate) + " TPS " + master_roll_diff + " " + dec(core_rate) + " TPS/core (" + cores +") " + (forks?dec(worker_rate) + " TPS/fork (" + (forks) +")":dec(roll_rate/workers) + " TPS/fork (initially " + (workers) +")"));
        
    if(forks == 0)
        process.exit();
        
  }, 1000); 
}

function worker_main() {

    logTag = (options.id?options.id+" ":"") 
           + 'fork ' + process.env.NODE_WORKER_ID
    worker_id = process.env.NODE_WORKER_ID

    vvlog('worker main')

    // define and start a Volt client
    client = new VoltClient([
    {
        host: 'ip-10-84-114-35.ec2.internal',
        port: 21212,
        username: 'user',
        password: 'password',
        service: 'database',
        queryTimeout: 50000,
        messageQueueSize: 20
    },
    {
        host: 'ip-10-60-199-203.ec2.internal',
        port: 21212,
        username: 'user',
        password: 'password',
        service: 'database',
        queryTimeout: 50000,
        messageQueueSize: 20
    }
    ]);
    
    client.connect(function startup(results) {
            vvlog('Node connected');
            voltInit();
        },
        function loginError(results) {
            log('Login error. Quitting.');
            process.exit();
    });

    process.on('message', function(m) {
        console.log('Unknwon message:', m);
    });
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
    steps.push(accessLoop);
    steps.push(writeEnd);
    return steps;
}

function connectionStats() {
    client.connectionStats();
}

function writeEnd(job) {
    if(options.verbose || options.debug) client.connectionStats();
    vvlog('writeEnd');
    process.exit();
}

function accessLoop(job) {

    var index = 0;
    var reads = job.loops;
    var writes = job.loops;
    var votes = job.loops;
    var startTime; 
    var chunkTime;

    var innerLoop = function() {

        if(options.vote) {

          var query = voteProc.getQuery();
          if(index < job.loops) {

               for(var i = 0; i < 1; i++) {
                  query.setParameters([getAreaCode(), getCandidate(), 200000]);
                  
                /////// the actual vote  ////////////////////////////
                /////////////////////////////////////////////////////
                  client.call(query, function displayResults(results) {
                    votes--;
                    if(votes <= 0) {
                        lapTime("votes", index, job.loops, chunkTime);
                        logTime(startTime, new Date().getTime(), job.loops, "Results");
                        step(job);
                    }
                  },
                  
                  function readyToWrite() {
                    
                    if(index <= job.loops && index && index % options.lograte == 0 ) {
                            lapTime("votes", index, job.loops, chunkTime);
                            chunkTime = new Date().getTime();
                        }
                        index++;
                        process.nextTick(innerLoop);
                  });
               }
            }
        }

        if(options.write) {
        
            var query = writeProc.getQuery();
            if(index < job.loops) {
            
                var hello;
                var world;
                var language;

                if(options.numeric) {
                    // This is for the read test: to know what to look for
                    var seq = unique_sequence();
                    hello = "h" + seq
                    world = "w" + seq
                    language = "l" + seq
                }
                else
                {
                    hello = getRandString(1,20)
                    world = getRandString(1,20)
                    language = getRandString(1,20)
                }
                query.setParameters([hello, world, language]);
    
                /////// the actual write ////////////////////////////
                /////////////////////////////////////////////////////
                client.call(query, function displayResults(results) {
                    writes--;
                    if(writes <= 0) {
                        lapTime("writes", index, job.loops, chunkTime);
                        logTime(startTime, new Date().getTime(), job.loops, "Results");
                        step(job);
                    }
                }, function readyToWrite() {
                     if(index <= job.loops && index && index % options.lograte == 0 ) {
                       lapTime("writes", index, job.loops, chunkTime);
                       chunkTime = new Date().getTime(); // gap!
                     }  
                     index++;
                     process.nextTick(innerLoop);
               });
            }
        }

        if(options.read) {
        
            var query = readProc.getQuery();
            if(index < job.loops) {

                var language
                if(options.numeric) {
                    // enter these by using writes test
                    language = "l" + unique_sequence();
                }
                else
                    language = getRandString(1,20)
                query.setParameters([language]);
    
                /////// the actual read  ////////////////////////////
                /////////////////////////////////////////////////////
                client.call(query, function displayResults(results) {
                    reads--;
                    if(reads <= 0) {
                        lapTime("reads", index, job.loops, chunkTime);
                        logTime(startTime, new Date().getTime(), job.loops, "Results");
                        step(job);
                    }
                }, function readyToWrite() {
                     if(index <= job.loops && index && index % options.lograte == 0 ) {
                       lapTime("reads", index, job.loops, chunkTime);
                       chunkTime = new Date().getTime(); // gap!
                     }
                     index++;
                     process.nextTick(innerLoop);
               });
            }
        }
    };
    
    startTime = chunkTime = new Date().getTime();

    // start the above function
    process.nextTick(innerLoop);

}

/* Rolling lap averages */
var roll = options.logaverage / options.lograte;
var laps = [];
var acts = [];
var last_rate = 0;
var last_roll_rate = 0;

Array.prototype.fifo = function(x) {
    if(this.push(x) > roll) this.shift()
} 

Array.prototype.sum = function() {
    var sum = 0;
    for(var i=0; i<this.length; i++) sum += this[i];
    return sum;
};

function lapTime(act, i, max, chunkTime) {

    var total_writes = i
    var now_time = ((new Date().getTime()) - chunkTime)
    var now_writes = options.lograte
    var now_rate = Math.round(now_writes/now_time * 1000)

    laps.fifo(now_time);
    acts.fifo(now_writes);
    var now_rolls = laps.length;
    var now_roll_time = laps.sum();
    var now_roll_acts = acts.sum();
    var now_roll_rate = Math.round(now_roll_acts / now_roll_time * 1000);
    var now_diff = rcutpad(pad("", Math.log(Math.abs(now_rate - last_rate)), 
        (now_roll_rate > last_roll_rate ? "+" : "-")),8," ");
    last_rate = now_rate; // not var
    var roll_diff = pad("", Math.log(Math.abs(now_roll_rate - last_roll_rate)) /* / 2.302585092994046 */, 
        (now_roll_rate > last_roll_rate ? "+" : "-"));
    last_roll_rate = now_roll_rate; // not var
    
    if(!options.quiet)
        vlog('Executed ' + dec(total_writes) + ' '+ act +'. Last ' + dec(now_writes) +
        ' in ' + now_time + 'ms => ' + dec(now_rate) + ' TPS ' +
        '\nLast ' + dec(now_roll_acts) +
        ' in ' + now_roll_time + 'ms => ' + dec(now_roll_rate) + ' TPS ' +
        ( options.verbose || options.debug ?
        util.inspect(process.memoryUsage()) : ""));
    else
        log(dec(now_writes) + ' ' + act + ': ' + dec(now_rate) + ' TPS ' + now_diff + ' |  ' 
        + 'avg ' + dec(now_roll_acts) + ': ' + dec(now_roll_rate) + ' TPS '
        + roll_diff);

    process.send({ cmd: 'lap', worker: worker_id, rate: now_rate, average: now_roll_rate, average_range: now_roll_time });
        
}

function logTime(startTime, endTime, writes, typeString) {

  var endTimeMS = Math.max(1, endTime - startTime);
  var throughput = writes * 1000 / endTimeMS;

   qlog(util.format(
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

function _log(tx) {
    var time = new Date();
    time = pad(time.getHours(),2,"0") + ":" + pad(time.getMinutes(),2,"0") + ":" + pad(time.getSeconds(),2,"0") + ":" + pad(time.getMilliseconds(),3,"0")
    var lead = logTag + " " + time + ": ";
    tx = tx.replace(/\n/g, "\n" + lead);
    console.log(lead + tx);
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

// return a unique number
var seq = 0;
function unique_sequence() {
    return (seq++) * workers + ordnum;
}

// Voter Specific 

var area_codes = [907, 205, 256, 334, 251, 870, 501, 479, 480, 602, 623, 928, 520, 341, 764, 628, 831, 925, 909, 562, 661, 510, 650, 949, 760, 415, 951, 209, 669, 408, 559, 626, 442, 530, 916, 627, 714, 707, 310, 323, 213, 424, 747, 818, 858, 935, 619, 805, 369, 720, 303, 970, 719, 860, 203, 959, 475, 202, 302, 689, 407, 239, 850, 727, 321, 754, 954, 927, 352, 863, 386, 904, 561, 772, 786, 305, 941, 813, 478, 770, 470, 404, 762, 706, 678, 912, 229, 808, 515, 319, 563, 641, 712, 208, 217, 872, 312, 773, 464, 708, 224, 847, 779, 815, 618, 309, 331, 630, 317, 765, 574, 260, 219, 812, 913, 785, 316, 620, 606, 859, 502, 270, 504, 985, 225, 318, 337, 774, 508, 339, 781, 857, 617, 978, 351, 413, 443, 410, 301, 240, 207, 517, 810, 278, 679, 313, 586, 947, 248, 734, 269, 989, 906, 616, 231, 612, 320, 651, 763, 952, 218, 507, 636, 660, 975, 816, 573, 314, 557, 417, 769, 601, 662, 228, 406, 336, 252, 984, 919, 980, 910, 828, 704, 701, 402, 308, 603, 908, 848, 732, 551, 201, 862, 973, 609, 856, 575, 957, 505, 775, 702, 315, 518, 646, 347, 212, 718, 516, 917, 845, 631, 716, 585, 607, 914, 216, 330, 234, 567, 419, 440, 380, 740, 614, 283, 513, 937, 918, 580, 405, 503, 541, 971, 814, 717, 570, 878, 835, 484, 610, 267, 215, 724, 412, 401, 843, 864, 803, 605, 423, 865, 931, 615, 901, 731, 254, 325, 713, 940, 817, 430, 903, 806, 737, 512, 361, 210, 979, 936, 409, 972, 469, 214, 682, 832, 281, 830, 956, 432, 915, 435, 801, 385, 434, 804, 757, 703, 571, 276, 236, 540, 802, 509, 360, 564, 206, 425, 253, 715, 920, 262, 414, 608, 304, 307];

var voteCandidates = 'Edwina Burnam,Tabatha Gehling,Kelly Clauss,' + 'Jessie Alloway,Alana Bregman,Jessie Eichman,Allie Rogalski,Nita Coster,' + 'Kurt Walser,Ericka Dieter,Loraine NygrenTania Mattioli';

function getCandidate() {
  return Math.floor(Math.random() * 6) + 1;
}

function getAreaCode() {
  return area_codes[Math.floor(Math.random() * area_codes.length)] * 10000000 + Math.random() * 10000000;
}


// setup the voter db
function voltVoteInit() {

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

        var query = initProc.getQuery();
        query.setParameters([6, voteCandidates]);
        client.call(query, function initVoter(results) {
            var val = results.table[0][0];
            log('Voter db initialized for ' + val[''] + ' candidates.');
        });
      },
      function loginError(results) {
        log('Login error. Quitting.');
        process.exit();
    });
}

function getConfiguration(host) {
  var cfg = new VoltConfiguration();
  cfg.host = host;
  cfg.messageQueueSize = 20;
  return cfg;
}

function logResults() {
  logTime("Voted", new Date().getTime(), statsLoggingInterval, transactionCounter);
  transactionCounter = 0;
}

// Call the stored proc to colelct all votes.
exports.getVoteResults = function(callback) {
  var query = resultsProc.getQuery();
  client.call(query, callback);
}

function pad(s,w,c) {
    while (s.toString().length < w) s = c + s.toString();
    return s;
}

function rcutpad(s,w,c) {
    while (s.toString().length < w) s = s.toString() + c;
    return s.substr(0,w);
}