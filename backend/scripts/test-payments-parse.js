const { parseMakePayload, extractPortalDataFromPayload } = require('../portalDataMapper');

const raw = `{
  "fromSalesforce": true,
  "contactId": "003Jx00001ZtMGAIA3",
  "email": "rohitjainltp59@gmail.com",
  "payments":{"OneCRM__Date__c":"2026-06-29T04:00:00.000Z","OneCRM__Paid__c":20,"OneCRM__Amount__c":20,"OneCRM__Status__c":"Success","OneCRM__Payment_Type__c":null,"OneCRM__Positive_Amount__c":20,"OneCRM__Amount_Outstanding__c":0}, {"OneCRM__Date__c":"2026-06-29T04:00:00.000Z","OneCRM__Paid__c":0,"OneCRM__Amount__c":-20,"OneCRM__Status__c":"Success","OneCRM__Payment_Type__c":"Cash","OneCRM__Positive_Amount__c":20,"OneCRM__Amount_Outstanding__c":0}
}`;

const parsed = parseMakePayload(raw);
console.log('parsed ok:', Boolean(parsed));
console.log(JSON.stringify(extractPortalDataFromPayload(parsed).payments, null, 2));
