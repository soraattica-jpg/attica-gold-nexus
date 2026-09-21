import { timingSafeEqual } from 'node:crypto';
export function createPreviewReadAuthorization(actors) {
  return () => (req,res,next) => {
    const header=String(req.headers.authorization||'');
    if (!/^Bearer\s+/i.test(header)) return res.status(401).json({error:'Staging authentication required'});
    const supplied=Buffer.from(header.replace(/^Bearer\s+/i,''));
    const actor=actors.find(item=>{const expected=Buffer.from(item.token);return supplied.length===expected.length&&timingSafeEqual(supplied,expected);});
    if (!actor) return res.status(401).json({error:'Staging authentication required'});
    res.locals.actorId=actor.id; next();
  };
}
