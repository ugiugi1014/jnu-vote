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

contract TallyVerifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 7411927925512722192096020451142942757228155244228995199926435973119071839790;
    uint256 constant alphay  = 4291067993631506065883389423109046589000949993324645999778883884866237447243;
    uint256 constant betax1  = 17566760020111837017252272893627768494743196707261290292948575433594213348876;
    uint256 constant betax2  = 7858598039141009539035207813705742266886831005936593078857222419421438011944;
    uint256 constant betay1  = 33126347486411041276655957774436026630847745532543653044748781157112956364;
    uint256 constant betay2  = 2582969246213094924877419598937325892666827580327047473434827969168766347088;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 3764492092523496088906411746619396505233222848997878657277073878373206051339;
    uint256 constant deltax2 = 13400364608116960881912480658548693803526758842580073997942126862992719729672;
    uint256 constant deltay1 = 16795305897151289993446595131637628175419617318888093471944801093313214054728;
    uint256 constant deltay2 = 5667254380143477904023258731134973849181942796404615559508384076515893805189;

    
    uint256 constant IC0x = 12390987958098150896263474373942064731416966370304319340544873280750453457565;
    uint256 constant IC0y = 2646905895363703989023689655565747448892672041015148141318048012215290874904;
    
    uint256 constant IC1x = 12027870119298108784020307343877137310761792306451905863397520235550792960905;
    uint256 constant IC1y = 19205470090005413737245608135010778080040360220557803745135591607160293242284;
    
    uint256 constant IC2x = 8365467133937354336489700596429083290176452031181250681252813277261159718231;
    uint256 constant IC2y = 11111438276424613402690311356168350790482610630696276755316093356874640944536;
    
    uint256 constant IC3x = 6296382987468763096460211380449691845494225761332987642227553165312096771710;
    uint256 constant IC3y = 6151716927362389871016746093674383318816890190071014730469205068455826440405;
    
    uint256 constant IC4x = 565149126279771910643007594043470680795200683323023934968860766836584402456;
    uint256 constant IC4y = 17006200700034440140595166146308047924733219861179236866142105666508728241439;
    
    uint256 constant IC5x = 7035299545819753567009265697873859564858201487010647254807913217436811409049;
    uint256 constant IC5y = 13949264928559337268489952165925893288213447298757527867819546823839339509388;
    
    uint256 constant IC6x = 4146245166960793205036320964472451672693482166106897925817615182069014827271;
    uint256 constant IC6y = 17249521647085029295535921837329120903032849060685512255240619947824270327457;
    
    uint256 constant IC7x = 19825076524936430020180046665714150000487377475406323671783176276260764487301;
    uint256 constant IC7y = 17867977348105456823519087554401866255146472748978108911122021576677697067211;
    
    uint256 constant IC8x = 14849320052314146104036466640695189360873188788880071440327302649510781475014;
    uint256 constant IC8y = 7417918155294136656404801987588059694708579483213746081253195439963144335957;
    
    uint256 constant IC9x = 20725615942415304911908219304307891980145161605659199615459645155532438698012;
    uint256 constant IC9y = 12321482353896956117740572402093298242055957572761605921043106690395901919218;
    
    uint256 constant IC10x = 5713684007173045571084246564540838930827695398820375891949132727480607496875;
    uint256 constant IC10y = 14885106224078516166566356279046827904282329052353413669547070949878814933980;
    
    uint256 constant IC11x = 17760971090356632262200914569669820394850229584105828115386715974233868380571;
    uint256 constant IC11y = 1108365706363660047389232583348411284162281161587349860370036835793241922632;
    
    uint256 constant IC12x = 9612436924035004481102830613760217806421698813237494444684441037861661148174;
    uint256 constant IC12y = 13740773913889825778641027628370894338310031035865435181768226131872576138353;
    
    uint256 constant IC13x = 21600320866682840071370867387128110444639081481861292993470726501593999142786;
    uint256 constant IC13y = 15202562324050635008910805600771425135085414897217416342791401632168072904393;
    
    uint256 constant IC14x = 15845102654778659945687444158870187067415560860606388551734069389775355233585;
    uint256 constant IC14y = 15283667766146897536144868097165160466463095449218156976637659853431170812105;
    
    uint256 constant IC15x = 193688828039634268738527272723372720206241473655153209815829518834801969637;
    uint256 constant IC15y = 3137938102644908714577443621204509171100301506148096048845581920901339538439;
    
    uint256 constant IC16x = 9489120954510834083656369238019915769335839311319990853312455232406173583613;
    uint256 constant IC16y = 5026039038031604636072607991247530436847148063816034491001399647561335188797;
    
    uint256 constant IC17x = 2634999277148036466158749023034766938577937615189530345005758925961263700192;
    uint256 constant IC17y = 7228866532522893026565665595148760647633490089282654136674171259783851923293;
    
    uint256 constant IC18x = 10857739216663497164294093708399252998366825515359102551318177600608663659621;
    uint256 constant IC18y = 20968509238265176820924837393481124012744422592839575436346483781022882391404;
    
    uint256 constant IC19x = 15493658372679160075417826361085679063140087867751058492340928735914150161182;
    uint256 constant IC19y = 18875440627371029923245511313527955758416762581643209392579964833893763393768;
    
    uint256 constant IC20x = 18404751956198697241252103087720812815010064412736362437199818225617571558989;
    uint256 constant IC20y = 126408460114221707012269490915247593526730398020295101122568022830112296364;
    
    uint256 constant IC21x = 14238847098098368354126723986831472571060664314190792274268878620230484218898;
    uint256 constant IC21y = 13874169062939377119451525526789503064469030193290125910331202664537225674565;
    
    uint256 constant IC22x = 8108533375054575945260150813363772666062651161486128670523234832406522110249;
    uint256 constant IC22y = 4570473576848044004943702606321360187214718735166743731606196266777810813318;
    
    uint256 constant IC23x = 21284542503841600748137551219304476190758848533534459601500143784038017326105;
    uint256 constant IC23y = 16808459277370537529481994401545060442447260371853800756963287654909605348718;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[23] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                
                g1_mulAccC(_pVk, IC20x, IC20y, calldataload(add(pubSignals, 608)))
                
                g1_mulAccC(_pVk, IC21x, IC21y, calldataload(add(pubSignals, 640)))
                
                g1_mulAccC(_pVk, IC22x, IC22y, calldataload(add(pubSignals, 672)))
                
                g1_mulAccC(_pVk, IC23x, IC23y, calldataload(add(pubSignals, 704)))
                

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
            
            checkField(calldataload(add(_pubSignals, 320)))
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            
            checkField(calldataload(add(_pubSignals, 448)))
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            
            checkField(calldataload(add(_pubSignals, 608)))
            
            checkField(calldataload(add(_pubSignals, 640)))
            
            checkField(calldataload(add(_pubSignals, 672)))
            
            checkField(calldataload(add(_pubSignals, 704)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
