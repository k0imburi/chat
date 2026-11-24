import {createHash} from 'node:crypto'
import {EncryptJWT,jwtDecrypt} from 'jose'
const key=(secret:string)=>createHash('sha256').update(`vault-store:${secret}`).digest()
export async function encryptVaultValue(value:string,secret:string) {
 return new EncryptJWT({value}).setProtectedHeader({alg:'dir',enc:'A256GCM'}).encrypt(key(secret))
}
export async function decryptVaultValue(value:string,secret:string) {
 const {payload}=await jwtDecrypt(value,key(secret),{keyManagementAlgorithms:['dir'],contentEncryptionAlgorithms:['A256GCM']})
 if(typeof payload.value!=='string') throw new Error('Invalid encrypted value')
 return payload.value
}
