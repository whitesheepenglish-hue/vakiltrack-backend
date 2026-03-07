package com.example.vakildisk.repository;

import com.example.vakildisk.models.Case;
import com.example.vakildisk.models.Hearing;
import com.example.vakildisk.models.User;
import com.google.android.gms.tasks.OnCompleteListener;
import com.google.firebase.Timestamp;
import com.google.firebase.firestore.CollectionReference;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.EventListener;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.Query;
import com.google.firebase.firestore.QuerySnapshot;

import java.util.HashMap;
import java.util.Map;

public class FirestoreRepository {

    private final FirebaseFirestore db;
    private final CollectionReference usersRef;
    private final CollectionReference casesRef;
    private final CollectionReference hearingsRef;

    public FirestoreRepository() {
        this.db = FirebaseFirestore.getInstance();
        this.usersRef = db.collection("users");
        this.casesRef = db.collection("cases");
        this.hearingsRef = db.collection("hearings");
    }

    // --- User Operations ---

    public void createUser(User user, OnCompleteListener<Void> listener) {
        usersRef.document(user.getUserId()).set(user).addOnCompleteListener(listener);
    }

    public void getUserById(String userId, OnCompleteListener<com.google.firebase.firestore.DocumentSnapshot> listener) {
        usersRef.document(userId).get().addOnCompleteListener(listener);
    }

    // --- Case Operations ---

    public void createCase(Case caseObj, OnCompleteListener<DocumentReference> listener) {
        casesRef.add(caseObj).addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                String id = task.getResult().getId();
                casesRef.document(id).update("caseId", id);
            }
            listener.onComplete(task);
        });
    }

    public void updateCase(String caseId, Map<String, Object> updates, OnCompleteListener<Void> listener) {
        casesRef.document(caseId).update(updates).addOnCompleteListener(listener);
    }

    public void getCasesBySeniorId(String seniorId, EventListener<QuerySnapshot> listener) {
        casesRef.whereEqualTo("seniorId", seniorId)
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .addSnapshotListener(listener);
    }

    public void getCasesByJuniorId(String juniorId, EventListener<QuerySnapshot> listener) {
        casesRef.whereEqualTo("juniorId", juniorId)
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .addSnapshotListener(listener);
    }

    // --- Hearing Operations ---

    public void createHearing(Hearing hearing, OnCompleteListener<DocumentReference> listener) {
        hearingsRef.add(hearing).addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                String id = task.getResult().getId();
                hearingsRef.document(id).update("hearingId", id);
                
                // When a hearing is created, update the nextHearingDate in the case document
                Map<String, Object> update = new HashMap<>();
                update.put("nextHearingDate", hearing.getHearingDate());
                updateCase(hearing.getCaseId(), update, task1 -> {});
            }
            listener.onComplete(task);
        });
    }

    public void updateHearingDate(String caseId, Timestamp newDate, OnCompleteListener<Void> listener) {
        Map<String, Object> update = new HashMap<>();
        update.put("nextHearingDate", newDate);
        casesRef.document(caseId).update(update).addOnCompleteListener(listener);
    }

    public void getHearingsByCaseId(String caseId, EventListener<QuerySnapshot> listener) {
        hearingsRef.whereEqualTo("caseId", caseId)
                .orderBy("hearingDate", Query.Direction.ASCENDING)
                .addSnapshotListener(listener);
    }
}
