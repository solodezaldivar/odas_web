// Load modules
const StringDecoder = require('string_decoder').StringDecoder;
var net = require('net');

let trackingServer
let potentialServer
var rgbValueStrings = ["rgb(75,192,192)","rgb(192,75,192)","rgb(192,192,30)","rgb(0,200,40)"];

/*
 * Create TCP server for source tracking
 */

 let remainingTrack = '';

 // Single source data
class Source {
  constructor(index) {

      // Web UI info
      this.index = index;
      this.rgbValueString = rgbValueStrings[index];
      this.selected = true;

      // Source info
      this.id = null;
      this.active = false;
      this.x = null;
      this.y = null;
      this.z = null;
  }
}

 // Single data frame
class DataFrame {
  constructor() {

      this.timestamp = null;
      this.ptimestamp = null;

      this.sources = [];
      rgbValueStrings.forEach(function (color,i) {
          this.sources.push(new Source(i));
      }.bind(this));

      this.potentialSources = [];
  }
}

var currentFrame = new DataFrame();

 exports.startTrackingServer = (odasStudio) => {
  console.log("SERVER STARTING")
   trackingServer = net.createServer();
   trackingServer.on('connection', handleConnection);

   trackingServer.listen(9000, function() {
     console.log('server listening to %j', trackingServer.address());
   });

   const print_data = function(event, msg) {
    console.log(msg);
   }

   function handleConnection(conn) {
     var remoteAddress = conn.remoteAddress + ':' + conn.remotePort;
     console.log('new client connection from %s', remoteAddress);

     conn.on('data', onConnData);
     conn.once('close', onConnClose);
     conn.on('error', onConnError);

     function onConnData(d) {

       var decoder = new StringDecoder();

       // Decode received string
       var stream = remainingTrack + decoder.write(d);
       strs = stream.split("}\n{");

       if(strs.length < 2) {
           remainingTrack = stream;
           return;
       }

       strs.forEach((str,index) => {
           if(index == strs.length-1) {
               remainingTrack = str;
               return;
           }

           if(str.charAt(0) !== '{') {
               str = '{' + str;
           }

           if(str.charAt(str.length-2) !== '}') {
               if(str.charAt(str.length-3)!== '}') {
                   str = str + '}';
               }
           }

           try {
            var data = JSON.parse(str);
          }
    
          catch(err) {
            // Can't parse frame
            console.error(err);
            console.log(str);
            return;
          }
          
          var newMap = {};
          var indexMap = {};

          var indexPool = [];
          rgbValueStrings.forEach(function(c,index) {
            indexPool.push(index);
        });
          var hasNewSource = false;

          data.src = data.src.filter(function(s) {
              return s.id !== 0;
          });

          if(data.src) {    // If frame contains sources

              data.src.forEach(function(src) {  // Remove still used index from the pool

                  if(typeof(indexMap[src.id])!='undefined') {  // If source is not new
                      indexPool.splice(indexPool.indexOf(indexMap[src.id]),1);
                      //console.log(indexPool);
                  }
              });

              data.src.forEach(function(src) { // Update sources

                  if(typeof(indexMap[src.id])!='undefined') {  // Source is already registered

                      newMap[src.id] = indexMap[src.id];
                  }

                  else {  // Source is new
                    newMap[src.id] = indexPool.shift(); // Get unused index from pool
                    // console.log('insert into map ', newMap[src.id].toString() + ' ' + src.id.toString());

                    currentFrame.sources[newMap[src.id]].id = src.id;
                    hasNewSource = true;

                  }

                  currentFrame.sources[newMap[src.id]].x = src.x;
                  currentFrame.sources[newMap[src.id]].y = src.y;
                  currentFrame.sources[newMap[src.id]].z = src.z;
                  // TODO: map src.activity in order to filter out sources based on energy threshold

                  currentFrame.sources[newMap[src.id]].active = !(src.x==0 && src.y==0 && src.z==0);

              });

          }

          indexMap = newMap;

          indexPool.forEach(function(index) { // Clear unused source slot

              currentFrame.sources[index].id = null;

              currentFrame.sources[index].x = null;
              currentFrame.sources[index].y = null;
              currentFrame.sources[index].z = null;

              currentFrame.sources[index].active = false;
              currentFrame.sources[index].selected = true;
          });
          i = 0
          currentFrame.sources.forEach(function(source,index) {
            if (source.active) 
            {
              i = source.index
              if (index == i) 
              {
                var x = source.x;
                var y = source.y;
                var z = source.z;

                var inc = Math.acos(z/Math.sqrt(x*x+y*y+z*z));
                var az = Math.atan2(y,x);
                angle = az * 180/Math.PI
                console.log("Azimuth: ",angle)
                console.log("Incline: ", inc)
              }
            }
          });

           try {
            // print json to terminal
            // console.log(str)


             odasStudio.mainWindow.webContents.send('newTracking',str);
             
             
             odasStudio.mainWindow.webContents.on('give_back',print_data);

             if(typeof odasStudio.odas.odas_process == 'undefined') {
               odasStudio.mainWindow.webContents.send('remote-online');
             }
           }

           catch(err) {
            console.log(err)
             console.log('Window was closed');
           }
       });
     }

     function onConnClose() {
       console.log('connection from %s closed', remoteAddress);
       odasStudio.mainWindow.webContents.send('remote-offline');
     }

     function onConnError(err) {
       console.log('Connection %s error: %s', remoteAddress, err.message);
     }
   }

 }


/*
 * Create TCP server for potential sources
 */

 let remainingPot = '';

 exports.startPotentialServer = (odasStudio) => {

   potentialServer = net.createServer();
   potentialServer.on('connection', handlePotConnection);

   potentialServer.listen(9001, function() {
     console.log('server listening to %j', potentialServer.address());
   });

   function handlePotConnection(conn) {
     var remoteAddress = conn.remoteAddress + ':' + conn.remotePort;
     console.log('new client connection from %s', remoteAddress);

     conn.on('data', onConnData);
     conn.once('close', onConnClose);
     conn.on('error', onConnError);

     function onConnData(d) {

       var decoder = new StringDecoder();

       // Decode received string
       var stream = remainingPot + decoder.write(d);
       strs = stream.split("}\n{");
       if(strs.length < 2) {
           remainingPot = stream;
           return;
       }

       strs.forEach((str,index) => {

           if(index == strs.length-1) {
               remainingPot = str;
               return;
           }

           try {

               if(str.charAt(0) !== '{') {
                   str = '{' + str;
               }

               if(str.charAt(str.length-2) !== '}') {
                   if(str.charAt(str.length-3)!== '}') {
                       str = str + '}';
                   }
               }
             odasStudio.mainWindow.webContents.send('newPotential',str);
             if(typeof odasStudio.odas.odas_process == 'undefined') {
               odasStudio.mainWindow.webContents.send('remote-online');
             }
           }

           catch(err) {
             console.log('Window was closed');
           }
       });

     }

     function onConnClose() {
       console.log('connection from %s closed', remoteAddress);
       odasStudio.mainWindow.webContents.send('remote-offline');
     }

     function onConnError(err) {
       console.log('Connection %s error: %s', remoteAddress, err.message);
     }
   }
 }
