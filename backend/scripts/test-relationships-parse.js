const { parseMakePayload, extractPortalDataFromPayload } = require('../portalDataMapper');

const raw = `{
  "fromSalesforce": true,
  "relationships": {"Name":"Rohit Jain","OneCRM__Type__c":"Sibling","OneCRM__Status__c":"Current","OneCRM__Relationship_Explanation__c":"Mohd Khan is Rohit Jain's Sibling"}, {"Name":"Rohit Jain","OneCRM__Type__c":"Brother","OneCRM__Status__c":"Current","OneCRM__Relationship_Explanation__c":"Mohd Khan is Rohit Jain's Brother"},
  "payments": []
}`;

const parsed = parseMakePayload(raw);
console.log('parsed ok:', Boolean(parsed));
console.log(JSON.stringify(extractPortalDataFromPayload(parsed).relationships, null, 2));
