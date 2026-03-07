db.collection("cases")
.document(caseId)
.addSnapshotListener { snapshot, error ->

    if(snapshot != null) {

        val hearing = snapshot.getString("nextHearingDate")

        hearingTextView.text = hearing ?: "Not Scheduled"
    }
}