(function(ctx){

    var voicePromise = (function(){
        return new Promise(function(resolve, reject){
            var intervalHandle = window.setInterval(function(){	
                var allVoices = speechSynthesis.getVoices();
                console.log('loading voices');
                if(!allVoices || !allVoices.length) return;
                var voice;
                var voices = speechSynthesis.getVoices().some(function(v) { 
                    var found = (v.name.toLowerCase() === 'alex' && v.lang.toLowerCase() === 'en-us') || (v.name.toLowerCase().trim() === 'google us english');
                    found && (voice = v);
                    return found;
                });
                voice = voice || allVoices[0];  
                resolve(voice);  
                window.clearInterval(intervalHandle);
            }, 100);
        });
    })();
    
    function speak(text){
        voicePromise.then(function(voice){
            var utter = new SpeechSynthesisUtterance();
            utter.voice = voice;
            utter.pitch = 1;
            utter.rate = 1;
            utter.volume = 1;
            utter.text = text;
            //utter.text = '<?xml version="1.0"?>\r\n<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">'+ text +'</speak>';
            
            utter.onend = function(e){
                console.log('utter ended'); //, e);
                utter = null;
            };
            utter.onerror = function(e){
                console.log('utter error', e);
            };

            speechSynthesis.speak(utter);

            /*//with https its more reliable to stop listening while speaking
            stopRecognition()
            .then(function(){
                return new Promise(function(resolve, reject){
                    speechSynthesis.speak(utter);
                    utter.onend = function(){
                        resolve();
                        console.log('utter ended');
                    };
                    utter.onerror = function(e){
                        console.log('utter error', e);
                        reject();
                    };
                }).then(function(){
                    startRecognition();
                });
            });*/
        });
    }

    var SpeechRecognition = SpeechRecognition || webkitSpeechRecognition;
    var SpeechRecognitionEvent = SpeechRecognitionEvent || webkitSpeechRecognitionEvent;

    var recognition;
    var recognitionStarted;
    var recoginitionStateCallback;

    function start(callback){
        recoginitionStateCallback = callback;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.maxAlternatives = 1; // 5;
   
        console.log('recognition started');

        recognition.onresult = function(e){
            var current = e.results[e.results.length - 1];
            var phrase = current[0].transcript.trim();

            if(current.isFinal){
                var command = matchCommand(phrase);
                command && command.callback.apply(null, [ command.value, command.instructionType, current, e.results ]);
                //console.log('matching command', command);
            }

            invokeRecoginitionCallback('intrim-results', phrase, current);
        };
      
        startRecognition();
    }

    function setupStartEvent(){
        return new Promise(function(resolve, reject){
            recognition.onstart = function(e){
                recognitionStarted = true;
                invokeRecoginitionCallback('status-change', recognitionStarted);
                console.log('recg started'); //, e);
                resolve();
            };
        });
    }
    
    function setupEndEvent(){
        return new Promise(function(resolve, reject){
            recognition.onend = function(e){
                recognitionStarted = false;
                invokeRecoginitionCallback('status-change', recognitionStarted);
                console.log('recg ended'); //, e);
                resolve();
            };
        });
    }

    function setupOtherRecognitionEvents(){
        recognition.onspeechend = function(e){
            console.log('speech ended');
        };

        recognition.onnomatch = function(e){
            console.log('no match found');
        };

        recognition.onerror = function(e){
            console.log('error', e.error);
        };
    }

    function invokeRecoginitionCallback(){
        recoginitionStateCallback.apply(null, arguments);
    }

    function startRecognition(){
        if(!recognitionStarted && recognition){
            var promise = setupStartEvent();
            setupEndEvent();
            setupOtherRecognitionEvents();
            recognition.start();
            return promise;
        }

        return Promise.resolve();
    }

    function stopRecognition(){
        if(recognitionStarted && recognition) {
            var promise = setupEndEvent();
            recognition.stop();
            return promise;
        }

        return Promise.resolve();
    }

    function next(options){
        speak(options.instructionText);
        clearInstructionList();
       
        return new Promise(function(resolve, reject){
            addInstructionToList(options, resolve);
        });
    }

    var InstructionType = { 
        TEXT : 'text', // any text entry
        SELECT: 'select', // any selection such as drop down, radio, check , calendar...
        BUTTON: 'button', // button, link or any thing that trigger such events
        FORM: 'form' // only form submitting
    };

    var instructionsList = [];

    function addInstructionToList(options, callback, donotRemove){ //options = { name: string; unit: string; instructionType: InstructionType; possibleValues: Array<string>; }
        if (!options || !options.name || !options) return;
        var namePiped = options.name instanceof Array && options.name.join('|') || options.name;
        var unitClause = options.unit && ('(?:\\s+' + options.unit + '(?:s{0,1}))?') || '';
        var nameClause = '\\s+(?:' + namePiped + ')';
        var possibleValuesClause;
        if(options.possibleValues){
            possibleValuesClause = ('(' + options.possibleValues.join('|') + ')');
        } else if (options.pattern) {
            possibleValuesClause = ('(' + options.pattern + ')');
        } else {
            possibleValuesClause = '(.*?)';
        }
        var forClause = '(?:\\s+for)?';
        var beginClause = '^';
        var endClause = '$';
        var regex1, regex2;
        switch(options.instructionType){
            case InstructionType.TEXT: //'enter/put/record 10 dollars for price', 'enter 10 dollars for price', 'enter 10 for price', 'price 10', 'price is 10'
                regex1 = new RegExp(beginClause + '(?:enter|put|record\\s+)?' + possibleValuesClause + unitClause + forClause + nameClause + endClause, 'i');
                regex2 = new RegExp(beginClause + namePiped + '(?:\\s+is)?\\s+' + possibleValuesClause + '$', 'i');
                break;
            case InstructionType.SELECT: //'like/select/choose USA for country', 'select country USA', 'country USA', 'country is USA'
                regex1 = new RegExp(beginClause + '(?:like|choose|select\\s+)?' + possibleValuesClause + unitClause + forClause + nameClause  + endClause, 'i'); 
                regex2 = new RegExp(beginClause + namePiped + '(?:\\s+is)?\\s+' + possibleValuesClause + '$', 'i');
                break;
            case InstructionType.BUTTON: //'click/hit cancel', 'click cancel button', click cancel link',
                regex1 = new RegExp('^(?:click|hit|push|press\\s+)?(?:' + namePiped + ')(?:\\s+button|link)?$', 'i'); 
                break;
            case InstructionType.FORM: //'submit', 'submit form'
                regex1 = /^submit(?:\\s+form)?$/i; 
                break;
            default:
                console.log('instruction not properly defined.')
                break;
        }

        instructionsList.push({
                key: namePiped, 
                instructionType: options.instructionType, 
                pattern: regex1, 
                callback: callback,
                donotRemove: donotRemove
            });

        regex2 && 
            instructionsList.push({
                key: namePiped, 
                instructionType: options.instructionType, 
                pattern: regex2, 
                callback: callback,
                donotRemove: donotRemove
            });
    }

    function clearInstructionList(removeAll){
        if(removeAll){
            instructionsList = [];
        }else {
            instructionsList = instructionsList.filter(function(inst) { return inst.donotRemove });
        }
    }

    function matchCommand(input){
        var instruction, matchValue;
        
        instructionsList.some(function(inst){
            var result = inst.pattern.exec(input);
            if(result){
               instruction = inst;
               matchValue = result[1];
            }
            return result;
        });

        return instruction && 
            { 
                key: instruction.key,
                value: matchValue,
                instructionType: instruction.instructionType, 
                callback: instruction.callback,
            };
    }

    ctx.speechHelper = {
        speak: speak,
        start: start,
        next: next,
        toggleState: function(){
            recognitionStarted ? stopRecognition() : startRecognition();
        },
        addInstruction: function(options, callback) {
            addInstructionToList(options, callback, true);
        },
        clearInstructions: function(){
            clearInstructionList(true);
        }
    };

})(window);