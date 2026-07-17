// Terminal Garden
// Seedling v0.1
// Goal tracking system


let currentAmount = 0;

let settings = {
    goalAmount: 1400,
    displayMode: "percentage"
};


// Load widget settings

window.addEventListener('onWidgetLoad', function(obj) {

    settings = obj.detail.fieldData;

    loadProgress();

    updateDisplay();

});



// Listen for StreamElements events

window.addEventListener('onEventReceived', function(obj) {

    const listener = obj.detail.listener;
    const event = obj.detail.event;


    let contribution = 0;



    // SUBS

    if(listener === "subscriber-latest") {


        if(event.gifted) {

            contribution = 2.50;

        }

        else if(event.tier === "2000") {

            contribution = 5;

        }

        else if(event.tier === "3000") {

            contribution = 12.50;

        }

        else {

            contribution = 2.50;

        }

    }



    // BITS

    if(listener === "cheer-latest") {

        contribution = event.amount / 100;

    }



    // TIPS

    if(listener === "tip-latest") {

        contribution = Number(event.amount);

    }



    if(contribution > 0) {

        addContribution(contribution);

    }

});





function addContribution(amount) {


    currentAmount += amount;


    saveProgress();


    updateDisplay();


}





function updateDisplay() {


    const fill =
    document.querySelector(".progress-fill");


    const text =
    document.querySelector(".progress-text");


    const percentage =
    Math.min(
        (currentAmount / settings.goalAmount) * 100,
        100
    );


    fill.style.width =
    percentage + "%";



    if(settings.displayMode === "money") {


        text.innerHTML =
        `$${currentAmount.toFixed(2)} / $${settings.goalAmount}`;


    }


    else if(settings.displayMode === "both") {


        text.innerHTML =
        `${Math.floor(percentage)}%<br>
        $${currentAmount.toFixed(2)} / $${settings.goalAmount}`;


    }


    else {


        text.innerHTML =
        `${Math.floor(percentage)}%`;


    }

}





function saveProgress() {


    SE_API.store.set(
        "terminalGardenGoal",
        currentAmount
    );


}





function loadProgress() {


    SE_API.store.get(
        "terminalGardenGoal"
    )
    .then(function(value){


        if(value) {

            currentAmount =
            Number(value);

        }


        updateDisplay();


    });


}
