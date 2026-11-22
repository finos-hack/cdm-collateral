package collateral;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;

/**
 * W3C Verifiable Credentials 2.0 for the record keepers' statements of task-document-provenance: a record keeper (the
 * custodian, the tokenizer) attests that a provenance link holds by signing a credential whose subject is the link
 * record's hash. Per wp-adr-document-provenance (question 4, option B), each party has its own P-256 key, separate from
 * its Besu key, and signs with Data Integrity's {@code ecdsa-jcs-2019} cryptosuite (W3C Data Integrity ECDSA Cryptosuites
 * v1.0, which supports P-256 and P-384 only, not secp256k1).
 *
 * <p>The issuer is a {@code did:key} built from the P-256 Multikey (multicodec 0x1200, compressed point, base58btc), so a
 * verifier needs no DID resolver. The proof follows the cryptosuite's steps: JCS over the document without its proof
 * and over the proof options (with the document's {@code @context}), SHA-256 of each, the proof options' hash first,
 * then ECDSA P-256 over the concatenation, encoded as a multibase base58btc {@code proofValue}. Not run against the W3C
 * test suite; interoperability with other implementations is unverified.
 */
public final class ProvCredentials {
    private static final ObjectMapper M = new ObjectMapper();
    private static final byte[] P256_MULTICODEC = {(byte) 0x80, 0x24};
    public static final String VC_CONTEXT = "https://www.w3.org/ns/credentials/v2";

    private ProvCredentials() {}

    /** A party's P-256 key and its did:key. */
    public record Issuer(KeyPair keys, String did) {
        public String verificationMethod() {
            return did + "#" + did.substring("did:key:".length());
        }
    }

    public static Issuer newIssuer() {
        try {
            KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
            g.initialize(new ECGenParameterSpec("secp256r1"));
            KeyPair kp = g.generateKeyPair();
            return new Issuer(kp, didKey((ECPublicKey) kp.getPublic()));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** did:key of a P-256 public key: "z" + base58btc(0x8024 || compressed point). */
    public static String didKey(ECPublicKey pub) {
        byte[] x = fixed(pub.getW().getAffineX());
        byte[] compressed = new byte[33];
        compressed[0] = (byte) (pub.getW().getAffineY().testBit(0) ? 0x03 : 0x02);
        System.arraycopy(x, 0, compressed, 1, 32);
        byte[] mk = new byte[35];
        System.arraycopy(P256_MULTICODEC, 0, mk, 0, 2);
        System.arraycopy(compressed, 0, mk, 2, 33);
        return "did:key:z" + Base58.encode(mk);
    }

    /** The P-256 public key a did:key names. */
    public static PublicKey publicKey(String didKey) {
        if (!didKey.startsWith("did:key:z")) throw new IllegalArgumentException("not a base58btc did:key: " + didKey);
        byte[] mk = Base58.decode(didKey.substring("did:key:z".length()));
        if (mk.length != 35 || mk[0] != P256_MULTICODEC[0] || mk[1] != P256_MULTICODEC[1])
            throw new IllegalArgumentException("not a P-256 Multikey: " + didKey);
        try {
            AlgorithmParameters ap = AlgorithmParameters.getInstance("EC");
            ap.init(new ECGenParameterSpec("secp256r1"));
            ECParameterSpec spec = ap.getParameterSpec(ECParameterSpec.class);
            BigInteger p = ((java.security.spec.ECFieldFp) spec.getCurve().getField()).getP();
            BigInteger x = new BigInteger(1, Arrays.copyOfRange(mk, 3, 35));
            // y^2 = x^3 + a x + b (mod p); p = 3 (mod 4), so y = rhs^((p+1)/4)
            BigInteger rhs = x.pow(3).add(spec.getCurve().getA().multiply(x)).add(spec.getCurve().getB()).mod(p);
            BigInteger y = rhs.modPow(p.add(BigInteger.ONE).shiftRight(2), p);
            if (!y.multiply(y).mod(p).equals(rhs)) throw new IllegalArgumentException("point not on P-256: " + didKey);
            if (y.testBit(0) != (mk[2] == 0x03)) y = p.subtract(y);
            return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(new ECPoint(x, y), spec));
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * A credential by {@code issuer} that the link record with hash {@code recordHash} holds, with relation
     * {@code relation} (for example "cdmx:Custody"), signed with ecdsa-jcs-2019.
     */
    public static ObjectNode attest(Issuer issuer, String recordHash, String relation, String validFrom) {
        ObjectNode vc = M.createObjectNode();
        vc.putArray("@context").add(VC_CONTEXT).add(ProvRecords.context());
        vc.putArray("type").add("VerifiableCredential").add("cdmx:LinkAttestation");
        vc.put("issuer", issuer.did());
        vc.put("validFrom", validFrom);
        ObjectNode subject = vc.putObject("credentialSubject");
        subject.put("id", ProvRecords.urn(recordHash));
        subject.put("cdmx:relation", relation);
        ObjectNode proof = proofOptions(issuer.verificationMethod(), validFrom);
        byte[] data;
        try {
            data = hashData(vc, proof);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        proof.put("proofValue", "z" + Base58.encode(sign(issuer, data)));
        vc.set("proof", proof);
        return vc;
    }

    /** Whether a credential's proof verifies against the did:key its verification method names, and that key is the issuer's. */
    public static boolean verify(JsonNode vc) {
        try {
            JsonNode proof = vc.get("proof");
            if (proof == null || !"DataIntegrityProof".equals(proof.path("type").asText())
                || !"ecdsa-jcs-2019".equals(proof.path("cryptosuite").asText())) return false;
            String vm = proof.path("verificationMethod").asText();
            String did = vm.contains("#") ? vm.substring(0, vm.indexOf('#')) : vm;
            if (!did.equals(vc.path("issuer").asText())) return false;
            String pv = proof.path("proofValue").asText();
            if (!pv.startsWith("z")) return false;
            ObjectNode unsecured = vc.deepCopy();
            unsecured.remove("proof");
            ObjectNode options = proof.deepCopy();
            options.remove("proofValue");
            Signature s = Signature.getInstance("SHA256withECDSAinP1363Format");
            s.initVerify(publicKey(did));
            s.update(hashData(unsecured, options));
            return s.verify(Base58.decode(pv.substring(1)));
        } catch (Exception e) {
            return false;
        }
    }

    private static ObjectNode proofOptions(String verificationMethod, String created) {
        ObjectNode p = M.createObjectNode();
        p.put("type", "DataIntegrityProof");
        p.put("cryptosuite", "ecdsa-jcs-2019");
        p.put("created", created);
        p.put("verificationMethod", verificationMethod);
        p.put("proofPurpose", "assertionMethod");
        return p;
    }

    /** SHA-256(JCS(proof options + document @context)) || SHA-256(JCS(document without proof)). */
    private static byte[] hashData(JsonNode unsecured, ObjectNode options) throws Exception {
        ObjectNode config = options.deepCopy();
        ObjectNode doc = unsecured.deepCopy();
        doc.remove("proof");
        if (doc.has("@context")) config.set("@context", doc.get("@context"));
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        byte[] configHash = sha.digest(Jcs.canonical(config).getBytes(StandardCharsets.UTF_8));
        byte[] docHash = sha.digest(Jcs.canonical(doc).getBytes(StandardCharsets.UTF_8));
        byte[] out = new byte[64];
        System.arraycopy(configHash, 0, out, 0, 32);
        System.arraycopy(docHash, 0, out, 32, 32);
        return out;
    }

    private static byte[] sign(Issuer issuer, byte[] data) {
        try {
            Signature s = Signature.getInstance("SHA256withECDSAinP1363Format");
            s.initSign(issuer.keys().getPrivate());
            s.update(data);
            return s.sign();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] fixed(BigInteger v) {
        byte[] b = v.toByteArray();
        if (b.length == 32) return b;
        byte[] out = new byte[32];
        if (b.length > 32) System.arraycopy(b, b.length - 32, out, 0, 32);
        else System.arraycopy(b, 0, out, 32 - b.length, b.length);
        return out;
    }

    /** Base58 with the Bitcoin alphabet (multibase base58btc, prefix "z"). */
    static final class Base58 {
        private static final String ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
        private static final BigInteger BASE = BigInteger.valueOf(58);

        static String encode(byte[] in) {
            BigInteger n = new BigInteger(1, in);
            StringBuilder sb = new StringBuilder();
            while (n.signum() > 0) {
                BigInteger[] qr = n.divideAndRemainder(BASE);
                sb.append(ALPHABET.charAt(qr[1].intValue()));
                n = qr[0];
            }
            for (int i = 0; i < in.length && in[i] == 0; i++) sb.append('1');
            return sb.reverse().toString();
        }

        static byte[] decode(String s) {
            BigInteger n = BigInteger.ZERO;
            for (char c : s.toCharArray()) {
                int d = ALPHABET.indexOf(c);
                if (d < 0) throw new IllegalArgumentException("not base58btc: " + c);
                n = n.multiply(BASE).add(BigInteger.valueOf(d));
            }
            byte[] b = n.toByteArray();
            if (b.length > 1 && b[0] == 0) b = Arrays.copyOfRange(b, 1, b.length);
            int zeros = 0;
            while (zeros < s.length() && s.charAt(zeros) == '1') zeros++;
            byte[] out = new byte[zeros + (n.signum() == 0 ? 0 : b.length)];
            if (n.signum() != 0) System.arraycopy(b, 0, out, zeros, b.length);
            return out;
        }
    }
}
