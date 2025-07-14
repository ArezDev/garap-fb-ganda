fetch("/api/graphql/", {
    "headers": {
        "content-type": "application/x-www-form-urlencoded"
    },
    "body": new URLSearchParams({
        "variables": JSON.stringify({}),
        "doc_id": "6339492849481770",
        ...require("getAsyncParams")("POST")
      }),
    "method": "POST",
    "mode": "cors",
    "credentials": "include",
    "redirect": "follow"
    }).then(async(r) =>{
        let a = await r.json();
        if(a.data.fb_scraping_warning_clear.success==true){
            window.location.replace("https://facebook.com/?sk=welcome");
        }
});
    
