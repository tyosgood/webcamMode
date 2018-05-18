/**
 * Webcam Mode for Cisco CE endpoints (excluding DX)
 * @module Webcam Mode
 * @author Tyler Osgood <tyosgood@cisco.com>
 * @copyright Copyright (c) 2018 Cisco and/or its affiliates.
 * @license Cisco Sample Code License, Version 1.0
*/

/**
 * @license
 * Copyright (c) 2018 Cisco and/or its affiliates.
 *
 * This software is licensed to you under the terms of the Cisco Sample
 * Code License, Version 1.0 (the "License"). You may obtain a copy of the
 * License at
 *
 *                https://developer.cisco.com/docs/licenses
 *
 * All use of the material herein must be in accordance with the terms of
 * the License. All rights not expressly granted by the License are
 * reserved. Unless required by applicable law or agreed to separately in
 * writing, software distributed under the License is distributed on an "AS
 * IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied.
*/

/*
 * @notes
 * This script pins a full-screen selfview to the highest numbered output on the system
 * (connector 3 on SX80/MX700/MX800, connector 2 on all other systems) so you can use it as a source
 * for a webcam. Connect your HDMI capture device to the highest output and then use that
 * as the webcam in your online meeting
 * 
 * Currently compatible with CE 9.3 - for some reason it doesn't work right with 9.2
*/

const xapi = require('xapi');
var universalJoin = false;
var timer, pcConnector,outputConnector, dialString;

//use this to turn console debug logging on / off
var logging = false;


//this is the fuction that sets selfview fullscreen on/off on the highest number output connector on the codec
function setFullScreenSelfView(onoff) {
  xapi.command('Video Selfview Set', {
    OnMonitorRole: outputConnector,
    Mode: onoff,
    FullscreenMode: onoff,
  });
  debug("SelfView: " + onoff + " OnMonitorRole: "+outputConnector);
}

//debug logging function so we can turn console logs on/off
function debug(message){
  if (!logging) return;
  console.log(message);
}

function sendDTMF(digits)
{
    xapi.command("Call DTMFSend", {DTMFString: digits});
}

function setGUIvalues(guiId,value)
{
    xapi.command('UserInterface Extensions Widget SetValue', { 
        WidgetId: guiId, 
        Value: value
    });
}

function enterNumber(id = "dialOutNum", text = "Enter number to dial")
{
    xapi.command("UserInterface Message TextInput Display", {
				  Duration: 45
				, FeedbackId: id
				, InputType: 'Numeric'
				, KeyboardState:'Open'
				, Placeholder: text
				, SubmitText:'Submit'
				, Title: text
				, Text: text
			    });
}

function enableUJ(event)
{
  universalJoin = event.Value === 'on'? true : false;
      setFullScreenSelfView(event.Value);
        if (universalJoin){
          xapi.command('UserInterface Message TextLine Display',
                  {
                    Text: 'Webcam Mode',
                    Duration: "30",
                    X: '100',
                    Y: '100'
                  });
          //the following code is used to keep the codec from going into standby or halfwake while in Universal Join Mode
          //based on logic from one of the example macros
          const RefreshTime = 29 * 1000;
          timer = setInterval(() =>{ xapi.command('Standby ResetTimer', { Delay: 1 });}, RefreshTime);
        }
      else { debug('clearInterval'); clearInterval(timer);}
}

//initial config tasks
  xapi.command('UserInterface Extensions Widget SetValue', {
      WidgetId: 'toggle_UJ',
      Value: 'Off',
  });
  
  setGUIvalues('dialin_txt', 'Current Dial-in Number: NONE');

//Get the PC input source for the codec -(presentation input)
  xapi.config.get('Video Input Connector').then(list => {
      for (let i in list){
        debug('Connector '+ list[i].id +': '+ list[i].InputSourceType);
        pcConnector = list[i].InputSourceType === 'PC' ? list[i].id : null;
        debug('pcConnector is: '+pcConnector);
      }
  });

//Get the highest numbered video output on the system (that's where we assume the USB capture device is connected) - default to 2
  xapi.config.get('Video Output Connector').then(list => {
      debug('Highest Output connector: ' +list.length);
      switch (list.length){
        case 2:
          outputConnector = 'Second';
          break;
        case 3:
          outputConnector = 'Third';
          break;
        case 4:
          outputConnector = 'Fourth';
          break;
        default:
          outputConnector = 'Second';
      }
      debug('Highest Output connector: ' +outputConnector);
  });


//Listen and react to events

  xapi.event.on('UserInterface Extensions Widget Action', (event) => {
      if (event.WidgetId == "toggle_UJ"){
        enableUJ(event);
      }
      else if(event.WidgetId == 'enterPhone'&& event.Type == 'clicked'){
        debug('EnterPhone clicked: '+event);
        enterNumber();
      }
      else if(event.WidgetId == 'dial'&& dialString && event.Type == 'clicked' ){
         xapi.status.get('SystemUnit State NumberOfActiveCalls').then(calls => {
           if (calls === '0'){xapi.command('Dial', {
             Number: dialString,
             CallType: 'Audio'  
           }
           );}
         } );
      }
      
  });

 xapi.event.on('UserInterface Message TextInput Response', (event) => {
	switch(event.FeedbackId){
	  case 'dialOutNum':
	    dialString = event.Text;
	    setGUIvalues('dialin_txt', 'Current Dial-In Number: '+dialString);
	    break;
    case 'confId':
      sendDTMF(event.Text);
	    if(!event.Text.includes('#'))sendDTMF('#');
	}   
 });

  xapi.status.on('Video Selfview OnMonitorRole', (event) => {
      debug('OnMonitorRole: '+event);
      if (event !== outputConnector && universalJoin){
        setFullScreenSelfView('on');
      } 
  });
  
  xapi.status.on('Video Selfview FullscreenMode', (event) => {
      debug('SelfViewFullScreenMode: '+event);
      if (event == 'Off' && universalJoin){
        setFullScreenSelfView('on');
      } 
  });
  
  xapi.status.on('Video Selfview Mode', (event) => {
      debug('SelfViewMode: '+event);
      if (event == 'Off' && universalJoin){
        setFullScreenSelfView('on');
      } 
  });
  
  xapi.status.on('Video Input Connector', (event) => {
      debug('ConnectorID: '+event.id+ ' SignalState:'+event.SignalState);
      if (universalJoin && event.id == pcConnector){
        switch(event.SignalState){
          case 'OK':
               xapi.command('Presentation Start', {SendingMode: 'LocalOnly'});
               break;
          default:
              xapi.command('Presentation Stop');
              break;
        }
       }
  });
 
  
  xapi.status.on('SystemUnit State NumberOfActiveCalls', (numCalls) => {
      if (universalJoin && numCalls > 0) 
            {
              if (dialString){
                xapi.status.get('Call').then(call => {
                  debug(call);
                  if(call[0].RemoteNumber.includes(dialString)){enterNumber('confId', 'Enter your ConferenceID / Meeting Number');
                    xapi.command('Presentation Start', {SendingMode: 'LocalOnly'});
                  }
                });
              }
              else xapi.command('Presentation Start', {SendingMode: 'LocalOnly'});
              
              debug('In Active Call: ' + numCalls);
            }  
  });
