import crypto from 'node:crypto';
import {apiError,apiSuccess} from '@/lib/api';
import {hashOtp} from '@/lib/auth/otp';
import {createUserSession} from '@/lib/auth/session';
import {db} from '@/lib/db';
import {verifyRegistrationSchema} from '@/lib/validators/auth';
import {checkOrigin,fail,lockTransaction} from '@/lib/management/server';
export async function POST(request:Request){try{
 checkOrigin(request);const parsed=verifyRegistrationSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return apiError('Invalid verification request.',400);
 const secret=process.env.AUTH_SIGNUP_OTP_SECRET;if(!secret)return apiError('Account verification is temporarily unavailable.',503);
 const {email,code}=parsed.data;
 const result=await db.$transaction(async tx=>{
  await lockTransaction(tx,'signup:'+email);
  const verification=await tx.signupVerificationCode.findFirst({where:{email,role:'employee',verifiedAt:null},orderBy:{createdAt:'desc'}});
  if(!verification||verification.expiresAt<new Date())return {error:'Verification code expired or unavailable. Request a new code.'};
  if(verification.attempts>=5)return {error:'Too many incorrect attempts. Request a new code.'};
  const submitted=Buffer.from(hashOtp(secret,email,'employee',code)),expected=Buffer.from(verification.codeHash);
  if(submitted.length!==expected.length||!crypto.timingSafeEqual(submitted,expected)){await tx.signupVerificationCode.update({where:{id:verification.id},data:{attempts:{increment:1}}});return {error:'Verification code is incorrect.'};}
  if(await tx.user.findUnique({where:{email},select:{id:true}}))return {error:'This account already exists. Sign in or use password reset.'};
  const user=await tx.user.create({data:{email,role:'employee',name:verification.name,passwordHash:verification.passwordHash,designation:verification.designation,departmentId:verification.departmentId}});
  await tx.signupVerificationCode.update({where:{id:verification.id},data:{verifiedAt:new Date()}});return {user};
 },{isolationLevel:'Serializable'});
 if('error' in result)return apiError(result.error??'Verification failed.',400);
 await createUserSession({sessionId:crypto.randomUUID(),userId:result.user.id,role:result.user.role,email:result.user.email});
 return apiSuccess({message:'Account verified successfully.',user:{role:result.user.role}});
}catch(e){return fail(e);}}
