import { cleanString } from '../../shared/string.js';
import { normalizeIndianPhone } from '../../shared/phone.js';

export function readIdentity(query = {}) {
  return { phone: normalizeIndianPhone(query.phone), customerId: cleanString(query.customerId, 80) };
}
export function emptyProfile() {
  return { phone:'', customerName:'', mob2:'', district:'', location:'', branch:'', language:'', businessType:'',
    metalType:'', age:'', gender:'', grams:'', releaseGrossAmount:'', releasingAmount:'', bankName:'', onlinePrice:'',
    pricePerGram:'', advertisement:'', lead:'', formStatus:'', purpose:'', notes:'', latestCallStatus:'', latestStatus:'',
    latestFormStatus:'', latestDisposition:'', latestDispositionCategory:'', hasSavedDetails:false };
}
