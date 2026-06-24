import React, {useEffect, useState} from 'https://esm.sh/react@18.3.1';
import {renderToString} from 'https://esm.sh/react-dom@18.3.1/server';

// copy RoundTab code, but mock useEffect (server render doesn't run effects)
// instead, manually set data
const arr = (d) => Array.isArray(d) ? d : [];

function RoundTabStatic({data, gameName}) {
  const pairings = arr(data.pairings);
  const dateStr = new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
  return React.createElement('div', null,
    React.createElement('div', null, dateStr),
    React.createElement('div', null, data.question?.text || 'No question'),
    pairings.length === 0 ?
      React.createElement('div', null, 'No pairings yet') :
      React.createElement('ul', null, pairings.map(p => React.createElement('li', {key: p.asker_id}, p.asker_name)))
  );
}

const testData = {"round_num":1,"question":{"id":1,"text":"test question","tag":"reflective","tag_auto":true,"status":"upcoming"},"pairings":[]};

try {
  const html = renderToString(React.createElement(RoundTabStatic, {data: testData, gameName: "Test"}));
  console.log('RENDER OK, html length', html.length);
  console.log(html.slice(0,200));
} catch(e) {
  console.error('CRASH', e);
  console.error(e.stack);
}
