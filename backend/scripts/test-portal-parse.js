const { parseMakePayload, extractPortalDataFromPayload } = require('../portalDataMapper');

const sample = `{
  "found": true,
  "contactId": "003Jx00001ZtMGAIA3",
  "firstName": "Rohit",
  "lastName": "Jain",
  "mobile": "+91 9569552954",
  "gender": "Male",
}`;

const payload = parseMakePayload(sample);
const member = {
  contactId: payload.contactId,
  name: 'Rohit Jain',
  email: 'rohitjainltp59@gmail.com',
  mobile: payload.mobile,
};

console.log('payload parsed:', Boolean(payload));
console.log(JSON.stringify(extractPortalDataFromPayload(payload, member), null, 2));
