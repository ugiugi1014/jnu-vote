// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16Verifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 3475886217584556941420658195436504053070340455587208560703986427294615826079;
    uint256 constant alphay  = 5131407902502251032679329193451202301032385941568441819924510662403008787873;
    uint256 constant betax1  = 21071584998497170706716386614364815390253560253010860242261916217310695889390;
    uint256 constant betax2  = 21469960948260403084346812521510237734085476166872084136105933210020334070994;
    uint256 constant betay1  = 6427045800209957068804803424616148816341019036945375802262241717977140597564;
    uint256 constant betay2  = 13065822944159470081378602037202315909831164775869101073055180119725606757484;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 8982463289494639667374071784258734512522790351662988345751588594266161967351;
    uint256 constant deltax2 = 17425839030456566199994005379281741551247688202605614578356456661743630463052;
    uint256 constant deltay1 = 21657164589490885388445815654855525646912354107059523429735189950380640088225;
    uint256 constant deltay2 = 15480628343696103355894630558955780618733030221108368056747216807666447581245;

    
    uint256 constant IC0x = 20245665467425373377527307983760935141520121568736134695023214780976149992967;
    uint256 constant IC0y = 4537100925449277020223899373050033451989410604341476108182561310613965113299;
    
    uint256 constant IC1x = 2646534348418052544176171834747642561911500058762782953864851633025679216367;
    uint256 constant IC1y = 2510732186221638737380889212812941833922330910641502178218102434391965504038;
    
    uint256 constant IC2x = 21142146039675912870693026157147688274843402652318542852578378468832069402260;
    uint256 constant IC2y = 3488119020405493860762665412241822559374796792237982479676778855321087123408;
    
    uint256 constant IC3x = 19248606798171217427088947771602566991435339751706361198591950421987055785128;
    uint256 constant IC3y = 2401516053361582254149318374094775349637821435991751683640247498059769483568;
    
    uint256 constant IC4x = 16965810651273931417857585589265867263780565559873688240230585587435447526147;
    uint256 constant IC4y = 2093062338061841828453210562508475293603569919761960730396069288634951403132;
    
    uint256 constant IC5x = 3486098676252653632678148779971374524298685920561195102227520183758415351650;
    uint256 constant IC5y = 20545878040383275863913917430220192881223224991259255685095898159581147244832;
    
    uint256 constant IC6x = 7612734988087213745606432570033800262170974938053706192674566980399717963748;
    uint256 constant IC6y = 13052298410588453161987017378401003546555120421701538457444320514955162344354;
    
    uint256 constant IC7x = 11352745671658294575127518330183865405251000942319654491638982801268205642780;
    uint256 constant IC7y = 8222789137415709176740490900636261254056609483665463676224024974149037921987;
    
    uint256 constant IC8x = 18562577950935582794906561467835074282986995864844581362275698251871028505307;
    uint256 constant IC8y = 6173413666516353881434266629830680431231126834752257626279928412181562092561;
    
    uint256 constant IC9x = 18912403761369078101723480335615908853832357331197002341378952101124608450548;
    uint256 constant IC9y = 11044295066587324495748201796151246368615808805003316690294956101483953378518;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[9] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
